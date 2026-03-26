use std::path::PathBuf;

/// Write `content` to `path` as a UTF-8 text file.
///
/// Called from the frontend after the user has already chosen a save path via
/// the dialog plugin (which runs entirely in JS).  We accept the resolved path
/// as a string so we don't need to pull in the dialog plugin on the Rust side.
///
/// # Security
/// Rejects paths containing traversal components (`..`) and restricts output
/// to a set of safe file extensions to prevent arbitrary file writes.
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let dest = PathBuf::from(&path);

    // Reject path-traversal attempts.
    for component in dest.components() {
        if let std::path::Component::ParentDir = component {
            return Err("Path must not contain '..' components".into());
        }
    }

    // Restrict to safe export file extensions.
    let ext = dest
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    const ALLOWED_EXTENSIONS: &[&str] = &["html", "json", "csv", "txt", "md"];
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported file extension '.{ext}'. Allowed: {}",
            ALLOWED_EXTENSIONS.join(", ")
        ));
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create directory: {e:#}"))?;
    }
    std::fs::write(&dest, content.as_bytes())
        .map_err(|e| format!("Could not write file '{path}': {e:#}"))
}
