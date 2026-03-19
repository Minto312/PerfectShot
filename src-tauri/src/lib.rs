mod detector;

use detector::DetectionResult;

#[tauri::command]
fn detect_eyes(frame_data: Vec<u8>, width: u32, height: u32) -> DetectionResult {
    detector::face::detect(&frame_data, width, height)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![detect_eyes])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
