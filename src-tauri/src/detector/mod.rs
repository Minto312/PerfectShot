pub mod eye_score;
pub mod face;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FaceDetection {
    /// 正規化座標 (0.0-1.0)
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    /// 目の開き具合スコア (0.0=閉じ, 1.0=開き)
    pub eye_open_score: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectionResult {
    pub faces: Vec<FaceDetection>,
    /// 全員の目の開き具合の総合スコア
    pub overall_score: f32,
}
