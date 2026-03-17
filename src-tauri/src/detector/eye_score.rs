use super::landmark;

/// MediaPipe Face Meshの468ランドマークからEAR(Eye Aspect Ratio)を計算し、
/// 目の開き具合スコアを返す
///
/// EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
///   開眼: EAR ≈ 0.25-0.35
///   閉眼: EAR < 0.15

// MediaPipe 468点メッシュの目の輪郭インデックス (EAR計算用6点)
// 右目: 外側→上→上→内側→下→下
const RIGHT_EYE: [usize; 6] = [33, 160, 158, 133, 153, 144];
// 左目: 外側→上→上→内側→下→下
const LEFT_EYE: [usize; 6] = [362, 385, 387, 263, 373, 380];

// EARからスコアへの変換閾値
const EAR_OPEN: f32 = 0.25;
const EAR_CLOSED: f32 = 0.15;

pub fn estimate_eye_score(
    rgba: &[u8],
    img_width: u32,
    img_height: u32,
    face_x: f32,
    face_y: f32,
    face_w: f32,
    face_h: f32,
) -> f32 {
    let result = landmark::predict(rgba, img_width, img_height, face_x, face_y, face_w, face_h);

    let (landmarks, _score) = match result {
        Some(v) => v,
        None => return 0.5,
    };

    if landmarks.len() < 468 {
        return 0.5;
    }

    let left_ear = compute_ear(&landmarks, &LEFT_EYE);
    let right_ear = compute_ear(&landmarks, &RIGHT_EYE);
    let avg_ear = (left_ear + right_ear) / 2.0;

    ear_to_score(avg_ear)
}

/// 6点のランドマークからEARを計算
fn compute_ear(landmarks: &[(f32, f32)], indices: &[usize; 6]) -> f32 {
    let p1 = landmarks[indices[0]];
    let p2 = landmarks[indices[1]];
    let p3 = landmarks[indices[2]];
    let p4 = landmarks[indices[3]];
    let p5 = landmarks[indices[4]];
    let p6 = landmarks[indices[5]];

    let vertical1 = dist(p2, p6);
    let vertical2 = dist(p3, p5);
    let horizontal = dist(p1, p4);

    if horizontal < 1e-6 {
        return 0.0;
    }

    (vertical1 + vertical2) / (2.0 * horizontal)
}

fn dist(a: (f32, f32), b: (f32, f32)) -> f32 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

/// EAR値を0.0-1.0のスコアに線形変換
fn ear_to_score(ear: f32) -> f32 {
    if ear >= EAR_OPEN {
        1.0
    } else if ear <= EAR_CLOSED {
        0.0
    } else {
        (ear - EAR_CLOSED) / (EAR_OPEN - EAR_CLOSED)
    }
}
