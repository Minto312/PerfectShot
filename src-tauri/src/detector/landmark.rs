use ndarray::Array4;
use ort::session::Session;
use ort::value::Tensor;
use std::sync::{Mutex, OnceLock};

const FACE_MESH_MODEL: &[u8] = include_bytes!("../../models/face_mesh_192x192.onnx");
const INPUT_SIZE: u32 = 192;

static LANDMARK_SESSION: OnceLock<Mutex<Session>> = OnceLock::new();

fn get_session() -> &'static Mutex<Session> {
    LANDMARK_SESSION.get_or_init(|| {
        Mutex::new(
            Session::builder()
                .unwrap()
                .commit_from_memory(FACE_MESH_MODEL)
                .unwrap(),
        )
    })
}

/// 顔領域から468点のランドマーク座標を推論する
/// 返り値: (landmarks, score)
///   landmarks: 468点の(x, y)座標（0.0-1.0正規化）
///   score: 顔存在の確信度
pub fn predict(
    rgba: &[u8],
    img_width: u32,
    img_height: u32,
    face_x: f32,
    face_y: f32,
    face_w: f32,
    face_h: f32,
) -> Option<(Vec<(f32, f32)>, f32)> {
    let input = preprocess(rgba, img_width, img_height, face_x, face_y, face_w, face_h);
    let input_tensor = Tensor::from_array(input).unwrap();

    let mut session = get_session().lock().unwrap();
    let outputs = session.run(ort::inputs![input_tensor]).unwrap();

    // outputs[0] = landmarks [1, 1, 1, 1404], outputs[1] = score [1, 1, 1, 1]
    let (_, landmarks_data) = outputs[0].try_extract_tensor::<f32>().unwrap();
    let (_, score_data) = outputs[1].try_extract_tensor::<f32>().unwrap();

    let score = score_data[0];

    // 1404 = 468 * 3 (x, y, z)
    // 座標はピクセル空間(0-192)なので正規化する
    let landmarks: Vec<(f32, f32)> = (0..468)
        .map(|i| {
            let x = landmarks_data[i * 3] / INPUT_SIZE as f32;
            let y = landmarks_data[i * 3 + 1] / INPUT_SIZE as f32;
            (x, y)
        })
        .collect();

    Some((landmarks, score))
}

/// 顔BBox領域をクロップして192x192のNCHWテンソルに前処理
fn preprocess(
    rgba: &[u8],
    img_width: u32,
    img_height: u32,
    face_x: f32,
    face_y: f32,
    face_w: f32,
    face_h: f32,
) -> Array4<f32> {
    let mut tensor = Array4::<f32>::zeros((1, 3, INPUT_SIZE as usize, INPUT_SIZE as usize));

    // 顔BBoxのピクセル座標
    let crop_x = (face_x * img_width as f32) as u32;
    let crop_y = (face_y * img_height as f32) as u32;
    let crop_w = (face_w * img_width as f32).max(1.0) as u32;
    let crop_h = (face_h * img_height as f32).max(1.0) as u32;

    let scale_x = crop_w as f32 / INPUT_SIZE as f32;
    let scale_y = crop_h as f32 / INPUT_SIZE as f32;

    for dst_y in 0..INPUT_SIZE {
        for dst_x in 0..INPUT_SIZE {
            let src_x = (crop_x + (dst_x as f32 * scale_x) as u32).min(img_width - 1);
            let src_y = (crop_y + (dst_y as f32 * scale_y) as u32).min(img_height - 1);
            let idx = ((src_y * img_width + src_x) * 4) as usize;

            if idx + 2 < rgba.len() {
                // 0.0-1.0 正規化
                tensor[[0, 0, dst_y as usize, dst_x as usize]] = rgba[idx] as f32 / 255.0;
                tensor[[0, 1, dst_y as usize, dst_x as usize]] = rgba[idx + 1] as f32 / 255.0;
                tensor[[0, 2, dst_y as usize, dst_x as usize]] = rgba[idx + 2] as f32 / 255.0;
            }
        }
    }

    tensor
}
