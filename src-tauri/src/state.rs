//! Application-level Tauri managed state.
//!
//! `XrayClientState` holds a single lazily-initialised `XrayClient` that is
//! shared across every Tauri command invocation.  Because `XrayClient` stores
//! its bearer token behind an `Arc<Mutex<…>>`, cloning it (which commands do
//! when they pull it from state) keeps all clones pointing at the same cached
//! token — so only one `/authenticate` round-trip is needed for the lifetime
//! of the app (plus one automatic re-auth on 401).
//!
//! Call `XrayClientState::invalidate()` whenever the Xray credentials change
//! (e.g. after `save_config_cmd` or `clear_config`) so the next command
//! rebuilds the client with the new credentials.

use std::sync::Arc;
use tokio::sync::Mutex;

use crate::api::xray_client::XrayClient;

/// Tauri managed state for the shared Xray client.
pub struct XrayClientState(pub Arc<Mutex<Option<XrayClient>>>);

impl XrayClientState {
    /// Create the initial (empty) state; the client is built on first use.
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    /// Drop the cached client so the next command rebuilds it from the current
    /// config.  Must be called after credentials change.
    pub async fn invalidate(&self) {
        *self.0.lock().await = None;
    }
}
