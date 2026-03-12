/// 顔のBBox内のRGBA画像から目の開き具合スコアを推定する
///
/// 目が開いている場合: 白目と虹彩のコントラストが大きく、水平方向の輝度分散が大きい
/// 目が閉じている場合: まぶたで覆われ均一になり、輝度分散が小さい
pub fn estimate_eye_score(
    rgba: &[u8],
    img_width: u32,
    img_height: u32,
    face_x: f32,
    face_y: f32,
    face_w: f32,
    face_h: f32,
) -> f32 {
    // 目の領域を顔BBoxから推定
    // 顔の上部25%-45%、左右それぞれ15%-45%と55%-85%
    let left_eye = extract_eye_region(
        rgba, img_width, img_height,
        face_x, face_y, face_w, face_h,
        0.15, 0.25, 0.45, 0.45, // 左目: 顔内の相対座標
    );
    let right_eye = extract_eye_region(
        rgba, img_width, img_height,
        face_x, face_y, face_w, face_h,
        0.55, 0.25, 0.85, 0.45, // 右目
    );

    let left_score = compute_openness(&left_eye);
    let right_score = compute_openness(&right_eye);

    // 両目の平均
    (left_score + right_score) / 2.0
}

/// 目の領域のグレースケールピクセル値を取得
fn extract_eye_region(
    rgba: &[u8],
    img_width: u32,
    img_height: u32,
    face_x: f32,
    face_y: f32,
    face_w: f32,
    face_h: f32,
    rel_x1: f32,
    rel_y1: f32,
    rel_x2: f32,
    rel_y2: f32,
) -> Vec<f32> {
    let px_x1 = ((face_x + face_w * rel_x1) * img_width as f32) as u32;
    let px_y1 = ((face_y + face_h * rel_y1) * img_height as f32) as u32;
    let px_x2 = ((face_x + face_w * rel_x2) * img_width as f32) as u32;
    let px_y2 = ((face_y + face_h * rel_y2) * img_height as f32) as u32;

    let px_x1 = px_x1.min(img_width.saturating_sub(1));
    let px_y1 = px_y1.min(img_height.saturating_sub(1));
    let px_x2 = px_x2.min(img_width);
    let px_y2 = px_y2.min(img_height);

    let mut pixels = Vec::new();
    for y in px_y1..px_y2 {
        for x in px_x1..px_x2 {
            let idx = ((y * img_width + x) * 4) as usize;
            if idx + 2 < rgba.len() {
                // グレースケール変換
                let gray = 0.299 * rgba[idx] as f32
                    + 0.587 * rgba[idx + 1] as f32
                    + 0.114 * rgba[idx + 2] as f32;
                pixels.push(gray);
            }
        }
    }
    pixels
}

/// 目の領域の「開き具合」をピクセル統計から推定
fn compute_openness(pixels: &[f32]) -> f32 {
    if pixels.len() < 4 {
        return 0.5; // データ不足
    }

    let n = pixels.len() as f32;
    let mean = pixels.iter().sum::<f32>() / n;

    // 標準偏差（コントラスト指標）
    let variance = pixels.iter().map(|p| (p - mean).powi(2)).sum::<f32>() / n;
    let std_dev = variance.sqrt();

    // 最小値-最大値のレンジ
    let min = pixels.iter().cloned().fold(f32::INFINITY, f32::min);
    let max = pixels.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let range = max - min;

    // スコア: 標準偏差とレンジを組み合わせ
    // 目が開いている場合、std_dev > 20, range > 80 程度を期待
    // 目が閉じている場合、std_dev < 10, range < 40 程度を期待
    let std_score = (std_dev / 30.0).clamp(0.0, 1.0);
    let range_score = (range / 120.0).clamp(0.0, 1.0);

    // 重み付き平均
    (std_score * 0.6 + range_score * 0.4).clamp(0.0, 1.0)
}
