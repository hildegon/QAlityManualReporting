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

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};
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

// ── API Usage Tracking ───────────────────────────────────────────────────────

/// Return the epoch-millisecond timestamp of the start of the current UTC hour.
fn current_hour_start_ms() -> u64 {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let ms_per_hour = 3_600_000u64;
    (now_ms / ms_per_hour) * ms_per_hour
}

/// Return the current epoch-millisecond timestamp.
fn current_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Per-service API usage counters and last-seen rate-limit header values.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ServiceUsage {
    pub calls_this_hour: u32,
    pub hour_start_ms: u64,
    #[serde(skip)]
    pub last_remaining: Option<u32>,
    #[serde(skip)]
    pub last_limit: Option<u32>,
    #[serde(skip)]
    pub last_reset_ms: Option<u64>,
    /// Total calls since application start (resets on restart).
    pub calls_total: u32,
    /// How many 429 responses we received this session.
    pub rate_limit_hits: u32,
    /// Epoch-ms timestamp of the most recent 429 response, if any.
    pub last_rate_limited_at: Option<u64>,
    /// Per-window call counter — persisted to disk, resets each UTC hour.
    #[serde(default)]
    pub calls_all_time: u64,
    /// Per-window 429-hit counter — persisted to disk, resets each UTC hour.
    #[serde(default)]
    pub rate_limit_hits_all_time: u64,
}

impl ServiceUsage {
    fn new() -> Self {
        Self {
            calls_this_hour: 0,
            hour_start_ms: current_hour_start_ms(),
            last_remaining: None,
            last_limit: None,
            last_reset_ms: None,
            calls_total: 0,
            rate_limit_hits: 0,
            last_rate_limited_at: None,
            calls_all_time: 0,
            rate_limit_hits_all_time: 0,
        }
    }

    /// Record one API call, rolling the hourly counter if needed,
    /// and extracting any rate-limit headers from the response.
    ///
    /// When a response carries no rate-limit headers AND the previously
    /// recorded reset window has already elapsed, stale header values are
    /// cleared so the frontend doesn't keep showing a "limit reached" gauge
    /// that no longer reflects reality.
    pub fn record_call(&mut self, headers: &reqwest::header::HeaderMap) {
        let now_hour = current_hour_start_ms();
        if now_hour != self.hour_start_ms {
            self.calls_this_hour = 0;
            self.calls_all_time = 0;
            self.rate_limit_hits_all_time = 0;
            self.hour_start_ms = now_hour;
        }
        self.calls_this_hour += 1;
        self.calls_total += 1;
        self.calls_all_time += 1;

        let mut found_headers = false;

        if let Some(val) = headers.get("x-ratelimit-remaining") {
            if let Ok(s) = val.to_str() {
                if let Ok(n) = s.trim().parse::<u32>() {
                    self.last_remaining = Some(n);
                    found_headers = true;
                }
            }
        }
        if let Some(val) = headers.get("x-ratelimit-limit") {
            if let Ok(s) = val.to_str() {
                if let Ok(n) = s.trim().parse::<u32>() {
                    self.last_limit = Some(n);
                    found_headers = true;
                }
            }
        }
        if let Some(val) = headers.get("x-ratelimit-reset") {
            if let Ok(s) = val.to_str() {
                if let Ok(secs) = s.trim().parse::<u64>() {
                    self.last_reset_ms = Some(secs * 1_000);
                    found_headers = true;
                }
            }
        }

        // If this response had no rate-limit headers, check whether the
        // previous reset window has elapsed — if so, the old values are stale.
        if !found_headers {
            if let Some(reset_ms) = self.last_reset_ms {
                let now_ms = current_now_ms();
                if now_ms >= reset_ms {
                    self.last_remaining = None;
                    self.last_limit = None;
                    self.last_reset_ms = None;
                }
            }
        }
    }

    /// Record a 429 Too-Many-Requests response separately so the frontend
    /// can display how often we actually get rate-limited.
    pub fn record_rate_limit(&mut self, headers: &reqwest::header::HeaderMap) {
        self.rate_limit_hits += 1;
        self.rate_limit_hits_all_time += 1;
        self.last_rate_limited_at = Some(current_now_ms());
        self.record_call(headers);
    }

    /// Roll the hourly window if the UTC hour has changed, without recording
    /// a call.  Called by snapshot reads so the frontend always sees fresh
    /// numbers even when no API calls are in flight.
    pub fn maybe_reset_window(&mut self) {
        let now_hour = current_hour_start_ms();
        if now_hour != self.hour_start_ms {
            self.calls_this_hour = 0;
            self.calls_all_time = 0;
            self.rate_limit_hits_all_time = 0;
            self.hour_start_ms = now_hour;
        }
    }
}

// ── TrackedUsage ─────────────────────────────────────────────────────────────

/// Minimum interval (ms) between `api-usage-updated` Tauri events to avoid
/// flooding the frontend during batch API operations.
const EMIT_DEBOUNCE_MS: u64 = 500;

/// A thin wrapper around `Arc<StdMutex<ServiceUsage>>` that automatically
/// emits an `api-usage-updated` Tauri event after each recording.
///
/// Clients receive this instead of a raw Arc<Mutex>.  The event is debounced
/// so at most one event fires per [`EMIT_DEBOUNCE_MS`] window.
#[derive(Clone)]
pub struct TrackedUsage {
    inner: Arc<StdMutex<ServiceUsage>>,
    emitter: Arc<StdMutex<Option<tauri::AppHandle>>>,
    last_emit_ms: Arc<AtomicU64>,
}

impl TrackedUsage {
    pub fn new(
        inner: Arc<StdMutex<ServiceUsage>>,
        emitter: Arc<StdMutex<Option<tauri::AppHandle>>>,
    ) -> Self {
        Self {
            inner,
            emitter,
            last_emit_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Record a successful API call and emit an update event.
    pub fn record_call(&self, headers: &reqwest::header::HeaderMap) {
        if let Ok(mut u) = self.inner.lock() {
            u.record_call(headers);
        }
        self.maybe_emit();
    }

    /// Record a 429 response and emit an update event.
    pub fn record_rate_limit(&self, headers: &reqwest::header::HeaderMap) {
        if let Ok(mut u) = self.inner.lock() {
            u.record_rate_limit(headers);
        }
        self.maybe_emit();
    }

    /// Emit the Tauri event if enough time has elapsed since the last emission.
    fn maybe_emit(&self) {
        let now = current_now_ms();
        let prev = self.last_emit_ms.load(Ordering::Relaxed);
        if now.saturating_sub(prev) < EMIT_DEBOUNCE_MS {
            return;
        }
        // CAS to avoid double-emitting from concurrent callers.
        if self
            .last_emit_ms
            .compare_exchange(prev, now, Ordering::Relaxed, Ordering::Relaxed)
            .is_err()
        {
            return;
        }
        if let Ok(guard) = self.emitter.lock() {
            if let Some(ref handle) = *guard {
                use tauri::Emitter;
                let _ = handle.emit("api-usage-updated", ());
            }
        }
    }
}

/// Snapshot of Jira, Xray, and Confluence usage counters, returned by the
/// `get_api_usage` command.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ApiUsageSnapshot {
    pub jira: ServiceUsage,
    pub xray: ServiceUsage,
    pub confluence: ServiceUsage,
}

/// Tauri managed state that tracks API usage for Jira, Xray, and Confluence
/// independently.
pub struct ApiUsageState {
    pub jira: Arc<StdMutex<ServiceUsage>>,
    pub xray: Arc<StdMutex<ServiceUsage>>,
    pub confluence: Arc<StdMutex<ServiceUsage>>,
    /// Shared app handle for emitting events — set once during app setup.
    emitter: Arc<StdMutex<Option<tauri::AppHandle>>>,
}

impl ApiUsageState {
    pub fn new() -> Self {
        Self {
            jira: Arc::new(StdMutex::new(ServiceUsage::new())),
            xray: Arc::new(StdMutex::new(ServiceUsage::new())),
            confluence: Arc::new(StdMutex::new(ServiceUsage::new())),
            emitter: Arc::new(StdMutex::new(None)),
        }
    }

    /// Store the `AppHandle` so that `TrackedUsage` wrappers can emit events.
    /// Must be called once during `setup()`.
    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        if let Ok(mut guard) = self.emitter.lock() {
            *guard = Some(handle);
        }
    }

    /// Restore persisted per-window counters from disk, but only if we're
    /// still within the same UTC hour window.  Session counters
    /// (`calls_total`, `rate_limit_hits`, header fields) always start fresh.
    pub fn load_from_file(path: &std::path::Path) -> Self {
        let state = Self::new();
        let current_hour = current_hour_start_ms();
        if let Ok(json) = std::fs::read_to_string(path) {
            if let Ok(saved) = serde_json::from_str::<ApiUsageSnapshot>(&json) {
                // Only restore per-window counters if we're in the same hour.
                if saved.jira.hour_start_ms == current_hour {
                    if let Ok(mut u) = state.jira.lock() {
                        u.calls_all_time = saved.jira.calls_all_time;
                        u.rate_limit_hits_all_time = saved.jira.rate_limit_hits_all_time;
                    }
                }
                if saved.xray.hour_start_ms == current_hour {
                    if let Ok(mut u) = state.xray.lock() {
                        u.calls_all_time = saved.xray.calls_all_time;
                        u.rate_limit_hits_all_time = saved.xray.rate_limit_hits_all_time;
                    }
                }
                if saved.confluence.hour_start_ms == current_hour {
                    if let Ok(mut u) = state.confluence.lock() {
                        u.calls_all_time = saved.confluence.calls_all_time;
                        u.rate_limit_hits_all_time = saved.confluence.rate_limit_hits_all_time;
                    }
                }
            }
        }
        state
    }

    /// Persist the current counters to disk.  Called periodically by the
    /// `get_api_usage` command (every ~10 s via the frontend poll).
    pub fn save_to_file(&self, path: &std::path::Path) {
        let snap = self.snapshot();
        if let Ok(json) = serde_json::to_string(&snap) {
            let _ = std::fs::write(path, json.as_bytes());
        }
    }

    /// Get a tracked Jira usage wrapper for embedding in `JiraClient`.
    pub fn jira_usage(&self) -> TrackedUsage {
        TrackedUsage::new(self.jira.clone(), self.emitter.clone())
    }

    /// Get a tracked Xray usage wrapper for embedding in `XrayClient`.
    pub fn xray_usage(&self) -> TrackedUsage {
        TrackedUsage::new(self.xray.clone(), self.emitter.clone())
    }

    /// Get a tracked Confluence usage wrapper for embedding in
    /// `ConfluenceClient`.
    pub fn confluence_usage(&self) -> TrackedUsage {
        TrackedUsage::new(self.confluence.clone(), self.emitter.clone())
    }

    /// Take a point-in-time snapshot of all usage counters.
    /// Rolls over the hourly window first so the frontend always sees
    /// up-to-date numbers even when no API calls are being made.
    pub fn snapshot(&self) -> ApiUsageSnapshot {
        if let Ok(mut u) = self.jira.lock() {
            u.maybe_reset_window();
        }
        if let Ok(mut u) = self.xray.lock() {
            u.maybe_reset_window();
        }
        if let Ok(mut u) = self.confluence.lock() {
            u.maybe_reset_window();
        }
        ApiUsageSnapshot {
            jira: self.jira.lock().unwrap().clone(),
            xray: self.xray.lock().unwrap().clone(),
            confluence: self.confluence.lock().unwrap().clone(),
        }
    }
}
