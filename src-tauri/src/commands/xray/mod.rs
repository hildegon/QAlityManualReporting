use tauri::{AppHandle, State};

use crate::{
    api::xray_client::XrayClient,
    commands::config::load_config,
    state::XrayClientState,
};

mod executions;
mod health;
mod plans;
mod runs;
mod sets;
mod statuses;
mod tests;

pub use executions::*;
pub use health::*;
pub use plans::*;
pub use runs::*;
pub use sets::*;
pub use statuses::*;
pub use tests::*;

/// Format an anyhow error with its full cause chain for debugging.
pub(super) fn format_err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

/// Return a clone of the shared `XrayClient`, constructing it from config on
/// first use.  Cloning is cheap — the bearer-token cache is shared via `Arc`.
pub(super) async fn get_xray_client(
    app: &AppHandle,
    state: &State<'_, XrayClientState>,
) -> Result<XrayClient, String> {
    let mut guard = state.0.lock().await;
    if guard.is_none() {
        let config = load_config(app).map_err(format_err)?;
        if !config.is_xray_configured() {
            return Err(
                "Xray is not configured. Please set Client ID and Client Secret in Settings."
                    .into(),
            );
        }
        *guard = Some(XrayClient::new(
            config.xray_client_id,
            config.xray_client_secret,
        ).with_app_handle(app.clone()));
    }
    // Unwrap is safe: we just ensured it is Some.
    Ok(guard.as_ref().unwrap().clone())
}

/// A step as received from the frontend for `create_test`.
#[derive(Debug, serde::Deserialize)]
pub struct StepPayload {
    pub action: String,
    pub data: Option<String>,
    pub result: Option<String>,
}
