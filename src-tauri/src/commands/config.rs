use std::path::PathBuf;

use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json;
use tauri::{AppHandle, Manager, State};

use crate::{
    models::config::{AppConfig, EncryptedConfig},
    state::XrayClientState,
};

/// Derive the config file path using Tauri's app config directory.
fn config_path(app: &AppHandle) -> Result<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("Failed to resolve app config directory")?;
    std::fs::create_dir_all(&config_dir).context("Failed to create config directory")?;
    Ok(config_dir.join("config.enc"))
}

/// Generate or load the 32-byte AES key stored alongside the encrypted config.
/// The key is derived from a machine-local key file (`key.bin`).
fn get_or_create_key(app: &AppHandle) -> Result<[u8; 32]> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("Failed to resolve app config directory")?;
    let key_path = config_dir.join("key.bin");

    if key_path.exists() {
        let bytes = std::fs::read(&key_path).context("Failed to read key file")?;
        let arr: [u8; 32] = bytes
            .try_into()
            .ok()
            .context("Key file has invalid length")?;
        Ok(arr)
    } else {
        use rand::RngCore;
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        std::fs::write(&key_path, key).context("Failed to write key file")?;
        Ok(key)
    }
}

/// Save an `AppConfig` to disk, encrypted with AES-256-GCM.
pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<()> {
    let key_bytes = get_or_create_key(app)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let plaintext = serde_json::to_vec(config).context("Failed to serialize config")?;
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_slice())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {e}"))?;

    let encrypted = EncryptedConfig {
        nonce: STANDARD.encode(nonce),
        ciphertext: STANDARD.encode(&ciphertext),
    };

    let json = serde_json::to_string(&encrypted).context("Failed to serialize encrypted config")?;
    std::fs::write(config_path(app)?, json).context("Failed to write config file")?;
    Ok(())
}

/// Load and decrypt the `AppConfig` from disk. Returns `AppConfig::default()` if not found.
pub fn load_config(app: &AppHandle) -> Result<AppConfig> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let json = std::fs::read_to_string(&path).context("Failed to read config file")?;
    let encrypted: EncryptedConfig =
        serde_json::from_str(&json).context("Failed to parse encrypted config")?;

    let key_bytes = get_or_create_key(app)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let nonce_bytes = STANDARD
        .decode(&encrypted.nonce)
        .context("Failed to decode nonce")?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = STANDARD
        .decode(&encrypted.ciphertext)
        .context("Failed to decode ciphertext")?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_slice())
        .map_err(|e| anyhow::anyhow!("Decryption failed: {e}"))?;

    serde_json::from_slice(&plaintext).context("Failed to deserialize config")
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<AppConfig, String> {
    load_config(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_config_cmd(
    app: AppHandle,
    xray_state: State<'_, XrayClientState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config(&app, &config).map_err(|e| e.to_string())?;
    // Credentials may have changed — drop the cached Xray client so the next
    // command rebuilds it with the new client_id / client_secret.
    xray_state.invalidate().await;
    Ok(())
}

#[tauri::command]
pub async fn clear_config(
    app: AppHandle,
    xray_state: State<'_, XrayClientState>,
) -> Result<(), String> {
    let path = config_path(&app).map_err(|e| e.to_string())?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    // Config cleared — drop the cached Xray client.
    xray_state.invalidate().await;
    Ok(())
}
