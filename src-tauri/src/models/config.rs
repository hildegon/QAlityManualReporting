use serde::{Deserialize, Serialize};

/// Plaintext config stored in memory after decryption.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    /// Base URL of the Jira Cloud instance, e.g. "https://myorg.atlassian.net"
    pub jira_url: String,
    /// Atlassian account email (used for Jira Basic auth)
    pub jira_email: String,
    /// Jira Cloud API token (generated at id.atlassian.com)
    pub jira_api_token: String,
    /// Xray Cloud Client ID (from Xray API Keys settings)
    pub xray_client_id: String,
    /// Xray Cloud Client Secret
    pub xray_client_secret: String,
    /// Jira/Xray project key used for Test Plans, Test Sets, and Tests (e.g. "PROJ")
    #[serde(default)]
    pub content_project_key: String,
    /// Human-readable name for the content project (e.g. "My Project")
    #[serde(default)]
    pub content_project_name: String,
    /// Jira/Xray project key used for Test Executions (may differ from content_project_key)
    #[serde(default)]
    pub execution_project_key: String,
    /// Human-readable name for the execution project
    #[serde(default)]
    pub execution_project_name: String,
}

impl AppConfig {
    /// Returns `true` when all Jira Cloud credentials are present.
    pub fn is_jira_configured(&self) -> bool {
        !self.jira_url.is_empty() && !self.jira_email.is_empty() && !self.jira_api_token.is_empty()
    }

    /// Returns `true` when Xray Cloud credentials are present.
    pub fn is_xray_configured(&self) -> bool {
        !self.xray_client_id.is_empty() && !self.xray_client_secret.is_empty()
    }
}

/// Encrypted config as stored on disk.
#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedConfig {
    /// Base64-encoded AES-GCM nonce (12 bytes)
    pub nonce: String,
    /// Base64-encoded AES-GCM ciphertext
    pub ciphertext: String,
}
