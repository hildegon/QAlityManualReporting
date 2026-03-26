use anyhow::{bail, Context, Result};

use crate::api::common::check_rate_limit;

use super::JiraClient;

impl JiraClient {
    /// Add a file attachment to an existing Jira issue.
    ///
    /// Uses `POST /rest/api/3/issue/{key}/attachments` with `multipart/form-data`.
    ///
    /// # Security
    /// The file path is canonicalized and checked against a blocklist of sensitive
    /// directories (`.ssh`, `.gnupg`, `.config`) to prevent exfiltration of secrets.
    pub async fn add_attachment(&self, issue_key: &str, file_path: &str) -> Result<()> {
        let path = std::path::Path::new(file_path);
        let canonical = path
            .canonicalize()
            .with_context(|| format!("Cannot resolve attachment path: {file_path}"))?;

        // Reject files inside sensitive directories.
        let canonical_str = canonical.to_string_lossy();
        const BLOCKED_DIRS: &[&str] = &[
            "/.ssh/",
            "/.gnupg/",
            "/.config/",
            "/.aws/",
            "/.kube/",
            "\\.ssh\\",
            "\\.gnupg\\",
            "\\.config\\",
            "\\.aws\\",
            "\\.kube\\",
        ];
        for blocked in BLOCKED_DIRS {
            if canonical_str.contains(blocked) {
                bail!("Cannot attach files from sensitive directory: {blocked}");
            }
        }

        // Verify it's a regular file (not a directory, symlink target already resolved).
        if !canonical.is_file() {
            bail!("Attachment path does not point to a regular file: {file_path}");
        }

        let file_name = canonical
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment")
            .to_string();

        let bytes = tokio::fs::read(&canonical)
            .await
            .with_context(|| format!("Failed to read attachment file: {}", file_path))?;

        let ext = canonical
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let mime = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "svg" => "image/svg+xml",
            "mp4" => "video/mp4",
            "mov" => "video/quicktime",
            "avi" => "video/x-msvideo",
            "mkv" => "video/x-matroska",
            "webm" => "video/webm",
            _ => "application/octet-stream",
        };

        let url = format!(
            "{}/rest/api/3/issue/{}/attachments",
            self.base_url,
            issue_key.trim()
        );

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime)
            .context("Invalid MIME type")?;

        let form = reqwest::multipart::Form::new().part("file", part);

        check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("X-Atlassian-Token", "no-check")
                .multipart(form)
                .send()
                .await
                .context("Failed to send Jira add-attachment request")?,
        )?
        .error_for_status()
        .with_context(|| format!("Jira add-attachment failed for '{}'", issue_key))?;

        Ok(())
    }

    /// Add a plain-text comment to an existing Jira issue.
    ///
    /// Uses `POST /rest/api/3/issue/{key}/comment` with an ADF body.
    pub async fn add_comment(&self, issue_key: &str, body: &str) -> Result<()> {
        let url = format!(
            "{}/rest/api/3/issue/{}/comment",
            self.base_url,
            issue_key.trim()
        );
        let payload = serde_json::json!({
            "body": {
                "version": 1,
                "type": "doc",
                "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": body }] }]
            }
        });
        let resp = check_rate_limit(
            self.client
                .post(&url)
                .header("Authorization", &self.auth_header)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .json(&payload)
                .send()
                .await
                .context("Failed to send Jira add-comment request")?,
        )?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|_| "<no body>".to_string());
            return Err(anyhow::anyhow!(
                "Jira add-comment failed (HTTP {}) for '{}': {}",
                status.as_u16(),
                issue_key,
                text
            ));
        }
        Ok(())
    }

    /// Fetch an attachment from its authenticated Jira URL and return it as a base64 data URI.
    ///
    /// The returned string is a `data:<mime_type>;base64,<encoded>` URI that can be used
    /// directly in `<img src>` or `<video src>` without requiring filesystem access.
    ///
    /// # Security
    /// Validates that `content_url` belongs to the configured Jira instance to prevent
    /// SSRF attacks that could leak the auth header to an attacker-controlled server.
    pub async fn fetch_attachment_as_data_uri(
        &self,
        content_url: &str,
        mime_type: &str,
    ) -> Result<String> {
        use base64::{engine::general_purpose::STANDARD, Engine};

        if !content_url.starts_with(&self.base_url) {
            bail!(
                "Attachment URL must belong to the configured Jira instance (expected prefix '{}')",
                self.base_url
            );
        }

        let bytes = self
            .client
            .get(content_url)
            .header("Authorization", &self.auth_header)
            .send()
            .await
            .context("Failed to fetch attachment")?
            .error_for_status()
            .context("Attachment fetch returned an error status")?
            .bytes()
            .await
            .context("Failed to read attachment bytes")?;

        let encoded = STANDARD.encode(&bytes);
        Ok(format!("data:{mime_type};base64,{encoded}"))
    }
}
