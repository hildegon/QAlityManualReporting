use std::path::PathBuf;

/// Write `content` to `path` as a UTF-8 text file.
///
/// Called from the frontend after the user has already chosen a save path via
/// the dialog plugin (which runs entirely in JS).  We accept the resolved path
/// as a string so we don't need to pull in the dialog plugin on the Rust side.
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create directory: {e:#}"))?;
    }
    std::fs::write(&dest, content.as_bytes())
        .map_err(|e| format!("Could not write file '{path}': {e:#}"))
}
