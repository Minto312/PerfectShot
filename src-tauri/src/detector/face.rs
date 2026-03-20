use ndarray::Array4;
use ort::session::Session;
use ort::value::Tensor;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use super::eye_score;
use super::{DetectionResult, FaceDetection};

const MODEL_INPUT_W: u32 = 640;
const MODEL_INPUT_H: u32 = 480;
const CONFIDENCE_THRESHOLD: f32 = 0.7;
const NMS_THRESHOLD: f32 = 0.3;

/// BBoxスムージングの係数 (0.0=前フレームのみ, 1.0=現フレームのみ)
const BBOX_SMOOTH_ALPHA: f32 = 0.4;
/// EyeスコアEMAの係数
const SCORE_EMA_ALPHA: f32 = 0.5;
/// トラッキング対象とみなすIoU閾値
const TRACK_IOU_THRESHOLD: f32 = 0.3;

const ULTRAFACE_MODEL: &[u8] = include_bytes!("../../models/ultraface_640.onnx");

static SESSION: OnceLock<Mutex<Session>> = OnceLock::new();
static TRACKER: OnceLock<Mutex<Vec<TrackedFace>>> = OnceLock::new();

fn get_session() -> &'static Mutex<Session> {
    SESSION.get_or_init(|| {
        Mutex::new(
            Session::builder()
                .unwrap()
                .commit_from_memory(ULTRAFACE_MODEL)
                .unwrap(),
        )
    })
}

fn get_tracker() -> &'static Mutex<Vec<TrackedFace>> {
    TRACKER.get_or_init(|| Mutex::new(Vec::new()))
}

#[derive(Clone)]
struct TrackedFace {
    bbox: [f32; 4],       // smoothed [x, y, x+w, y+h]
    eye_score_ema: f32,   // EMA of eye open score
}

/// RGBAフレームデータから顔を検出する
pub fn detect(frame_data: &[u8], width: u32, height: u32) -> DetectionResult {
    let start = Instant::now();

    let input = preprocess(frame_data, width, height);
    let input_tensor = Tensor::from_array(input).unwrap();

    let mut session = get_session().lock().unwrap();
    let outputs = session.run(ort::inputs![input_tensor]).unwrap();

    // outputs[0] = scores [1, N, 2], outputs[1] = boxes [1, N, 4]
    let (scores_shape, scores_data) = outputs[0].try_extract_tensor::<f32>().unwrap();
    let (_, boxes_data) = outputs[1].try_extract_tensor::<f32>().unwrap();

    let num_boxes = scores_shape[1] as usize;

    let mut detections: Vec<(f32, [f32; 4])> = Vec::new();

    for i in 0..num_boxes {
        let confidence = scores_data[i * 2 + 1]; // face confidence
        if confidence < CONFIDENCE_THRESHOLD {
            continue;
        }
        let base = i * 4;
        let x1 = boxes_data[base];
        let y1 = boxes_data[base + 1];
        let x2 = boxes_data[base + 2];
        let y2 = boxes_data[base + 3];
        detections.push((confidence, [x1, y1, x2, y2]));
    }

    detections.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
    let detections = nms(&detections, NMS_THRESHOLD);

    // トラッカーと照合してスムージング
    let mut tracker = get_tracker().lock().unwrap();
    let mut new_tracked: Vec<TrackedFace> = Vec::new();
    let mut used_prev = vec![false; tracker.len()];

    let faces: Vec<FaceDetection> = detections
        .iter()
        .map(|(_conf, bbox)| {
            let raw_bbox = [
                bbox[0].clamp(0.0, 1.0),
                bbox[1].clamp(0.0, 1.0),
                bbox[2].clamp(0.0, 1.0),
                bbox[3].clamp(0.0, 1.0),
            ];

            // 前フレームで最もIoUが高いトラッキング対象を探す
            let matched = tracker
                .iter()
                .enumerate()
                .filter(|(i, _)| !used_prev[*i])
                .map(|(i, t)| (i, iou(&raw_bbox, &t.bbox)))
                .filter(|(_, v)| *v > TRACK_IOU_THRESHOLD)
                .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

            let smoothed_bbox = if let Some((prev_idx, _)) = matched {
                used_prev[prev_idx] = true;
                let prev = &tracker[prev_idx];
                [
                    lerp(prev.bbox[0], raw_bbox[0], BBOX_SMOOTH_ALPHA),
                    lerp(prev.bbox[1], raw_bbox[1], BBOX_SMOOTH_ALPHA),
                    lerp(prev.bbox[2], raw_bbox[2], BBOX_SMOOTH_ALPHA),
                    lerp(prev.bbox[3], raw_bbox[3], BBOX_SMOOTH_ALPHA),
                ]
            } else {
                raw_bbox
            };

            let x = smoothed_bbox[0];
            let y = smoothed_bbox[1];
            let w = smoothed_bbox[2] - smoothed_bbox[0];
            let h = smoothed_bbox[3] - smoothed_bbox[1];

            let raw_eye_score =
                eye_score::estimate_eye_score(frame_data, width, height, x, y, w, h);

            // EMAでスコアをスムージング
            let eye_open_score = if let Some((prev_idx, _)) = matched {
                lerp(tracker[prev_idx].eye_score_ema, raw_eye_score, SCORE_EMA_ALPHA)
            } else {
                raw_eye_score
            };

            new_tracked.push(TrackedFace {
                bbox: smoothed_bbox,
                eye_score_ema: eye_open_score,
            });

            FaceDetection {
                x,
                y,
                width: w,
                height: h,
                eye_open_score,
            }
        })
        .collect();

    *tracker = new_tracked;

    let overall_score = if faces.is_empty() {
        0.0
    } else {
        faces.iter().map(|f| f.eye_open_score).sum::<f32>() / faces.len() as f32
    };

    let elapsed = start.elapsed();
    eprintln!(
        "[detector] {}x{} -> {} faces, {:.1}ms",
        width, height, faces.len(), elapsed.as_secs_f64() * 1000.0,
    );

    DetectionResult {
        faces,
        overall_score,
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn preprocess(rgba: &[u8], width: u32, height: u32) -> Array4<f32> {
    let mut tensor = Array4::<f32>::zeros((1, 3, MODEL_INPUT_H as usize, MODEL_INPUT_W as usize));

    let scale_x = width as f32 / MODEL_INPUT_W as f32;
    let scale_y = height as f32 / MODEL_INPUT_H as f32;

    for dst_y in 0..MODEL_INPUT_H {
        for dst_x in 0..MODEL_INPUT_W {
            let src_x = ((dst_x as f32 * scale_x) as u32).min(width - 1);
            let src_y = ((dst_y as f32 * scale_y) as u32).min(height - 1);
            let idx = ((src_y * width + src_x) * 4) as usize;

            if idx + 2 < rgba.len() {
                tensor[[0, 0, dst_y as usize, dst_x as usize]] = (rgba[idx] as f32 - 127.0) / 128.0;
                tensor[[0, 1, dst_y as usize, dst_x as usize]] = (rgba[idx + 1] as f32 - 127.0) / 128.0;
                tensor[[0, 2, dst_y as usize, dst_x as usize]] = (rgba[idx + 2] as f32 - 127.0) / 128.0;
            }
        }
    }

    tensor
}

fn nms(detections: &[(f32, [f32; 4])], threshold: f32) -> Vec<(f32, [f32; 4])> {
    let mut result: Vec<(f32, [f32; 4])> = Vec::new();
    let mut suppressed = vec![false; detections.len()];

    for i in 0..detections.len() {
        if suppressed[i] {
            continue;
        }
        result.push(detections[i]);

        for j in (i + 1)..detections.len() {
            if suppressed[j] {
                continue;
            }
            if iou(&detections[i].1, &detections[j].1) > threshold {
                suppressed[j] = true;
            }
        }
    }

    result
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let x1 = a[0].max(b[0]);
    let y1 = a[1].max(b[1]);
    let x2 = a[2].min(b[2]);
    let y2 = a[3].min(b[3]);

    let intersection = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = (a[2] - a[0]) * (a[3] - a[1]);
    let area_b = (b[2] - b[0]) * (b[3] - b[1]);
    let union = area_a + area_b - intersection;

    if union <= 0.0 { 0.0 } else { intersection / union }
}
