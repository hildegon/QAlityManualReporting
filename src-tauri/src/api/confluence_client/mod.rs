use anyhow::{bail, Context, Result};
use reqwest::{Client, Response};

use crate::api::common::check_rate_limit;
use crate::models::confluence::{
    AttachmentV1Response, ChildrenResponse, ConfluenceAttachment, ConfluenceChild, ConfluencePage,
    ConfluenceSpace, PagesResponse, RawPage, SpacesResponse,
};
use crate::state::TrackedUsage;

/// Check HTTP status and return a descriptive error including the response body
/// when the status indicates failure.
async fn ensure_ok(resp: Response, operation: &str) -> Result<Response> {
    let status = resp.status();
    if status.is_client_error() || status.is_server_error() {
        let body = resp
            .text()
            .await
            .unwrap_or_else(|_| "(no body)".to_string());
        bail!(
            "Confluence {operation} failed with {status}: {}",
            crate::api::common::truncate_body(&body),
        );
    }
    Ok(resp)
}

/// HTTP client for the Confluence Cloud REST API v2.
///
/// Uses the same Basic auth credentials as Jira (email + API token).
/// The wiki base URL is derived from the Jira base URL by appending `/wiki/api/v2`.
pub struct ConfluenceClient {
    client: Client,
    /// e.g. `https://mysite.atlassian.net/wiki/api/v2`
    base_url: String,
    /// e.g. `https://mysite.atlassian.net/wiki`
    wiki_base: String,
    auth_header: String,
    /// Shared API-usage counter updated on every HTTP response.
    usage: TrackedUsage,
}

impl ConfluenceClient {
    /// Create a new client. `jira_base_url` is the Jira site URL (e.g.
    /// `https://mysite.atlassian.net`). The wiki API URL is derived automatically.
    pub fn new(
        jira_base_url: &str,
        email: &str,
        api_token: &str,
        usage: TrackedUsage,
    ) -> Self {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let credentials = STANDARD.encode(format!("{email}:{api_token}"));
        let site = jira_base_url.trim_end_matches('/');
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            client,
            base_url: format!("{site}/wiki/api/v2"),
            wiki_base: format!("{site}/wiki"),
            auth_header: format!("Basic {credentials}"),
            usage,
        }
    }

    /// Record an API call in the usage counter then delegate to
    /// `check_rate_limit` for 429 handling.
    fn track_response(&self, resp: Response) -> Result<Response> {
        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            self.usage.record_rate_limit(resp.headers());
        } else {
            self.usage.record_call(resp.headers());
        }
        check_rate_limit(resp)
    }

    /// List all current (non-archived) Confluence spaces visible to the user.
    pub async fn list_spaces(&self) -> Result<Vec<ConfluenceSpace>> {
        let mut all: Vec<ConfluenceSpace> = Vec::new();
        let mut url = format!(
            "{}/spaces?limit=250&status=current&sort=name",
            self.base_url,
        );

        loop {
            let resp: SpacesResponse = ensure_ok(
                self.track_response(
                    self.client
                        .get(&url)
                        .header("Authorization", &self.auth_header)
                        .header("Accept", "application/json")
                        .send()
                        .await
                        .context("Failed to send Confluence list-spaces request")?,
                )?,
                "list-spaces",
            )
            .await?
            .json()
            .await
            .context("Failed to parse Confluence list-spaces response")?;

            let has_next = resp
                .links
                .as_ref()
                .and_then(|l| l.next.as_ref())
                .cloned();

            all.extend(resp.results.into_iter().map(|s| s.into_public()));

            match has_next {
                Some(next) => url = next,
                None => break,
            }
        }

        Ok(all)
    }

    /// List pages in a Confluence space, optionally filtered to children of a
    /// specific parent page.
    pub async fn list_pages(
        &self,
        space_id: &str,
        parent_id: Option<&str>,
    ) -> Result<Vec<ConfluencePage>> {
        let mut all: Vec<ConfluencePage> = Vec::new();

        let initial_url = if let Some(pid) = parent_id {
            format!(
                "{}/pages/{}/children?limit=250&sort=title",
                self.base_url, pid,
            )
        } else {
            format!(
                "{}/spaces/{}/pages?depth=root&limit=250&sort=title",
                self.base_url, space_id,
            )
        };
        let mut url = initial_url;

        loop {
            let resp: PagesResponse = ensure_ok(
                self.track_response(
                    self.client
                        .get(&url)
                        .header("Authorization", &self.auth_header)
                        .header("Accept", "application/json")
                        .send()
                        .await
                        .context("Failed to send Confluence list-pages request")?,
                )?,
                "list-pages",
            )
            .await?
            .json()
            .await
            .context("Failed to parse Confluence list-pages response")?;

            let has_next = resp
                .links
                .as_ref()
                .and_then(|l| l.next.as_ref())
                .cloned();

            all.extend(
                resp.results
                    .into_iter()
                    .map(|p| p.into_public(&self.wiki_base)),
            );

            match has_next {
                Some(next) => url = next,
                None => break,
            }
        }

        Ok(all)
    }

    /// List direct children (pages + folders) of a page or folder.
    ///
    /// Uses the v2 `direct-children` endpoint which returns all content types.
    /// We filter down to pages and folders on the Rust side.
    ///
    /// - `parent_type` must be `"page"` or `"folder"`.
    pub async fn list_children(
        &self,
        parent_id: &str,
        parent_type: &str,
    ) -> Result<Vec<ConfluenceChild>> {
        let mut all: Vec<ConfluenceChild> = Vec::new();

        let path_prefix = match parent_type {
            "folder" => "folders",
            _ => "pages",
        };
        let mut url = format!(
            "{}/{}/{}/direct-children?limit=250&sort=child-position",
            self.base_url, path_prefix, parent_id,
        );

        loop {
            let resp: ChildrenResponse = ensure_ok(
                self.track_response(
                    self.client
                        .get(&url)
                        .header("Authorization", &self.auth_header)
                        .header("Accept", "application/json")
                        .send()
                        .await
                        .context("Failed to send Confluence list-children request")?,
                )?,
                "list-children",
            )
            .await?
            .json()
            .await
            .context("Failed to parse Confluence list-children response")?;

            let has_next = resp
                .links
                .as_ref()
                .and_then(|l| l.next.as_ref())
                .cloned();

            all.extend(resp.results.into_iter().filter_map(|c| c.into_public()));

            match has_next {
                Some(next) => url = next,
                None => break,
            }
        }

        Ok(all)
    }

    /// Fetch a single page by ID, including its storage-format body and version.
    pub async fn get_page(&self, page_id: &str) -> Result<ConfluencePage> {
        let url = format!(
            "{}/pages/{}?body-format=storage",
            self.base_url,
            page_id.trim(),
        );

        let raw: RawPage = ensure_ok(
            self.track_response(
                self.client
                    .get(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Accept", "application/json")
                    .send()
                    .await
                    .context("Failed to send Confluence get-page request")?,
            )?,
            "get-page",
        )
        .await?
        .json()
        .await
        .context("Failed to parse Confluence get-page response")?;

        Ok(raw.into_public(&self.wiki_base))
    }

    /// Create a new Confluence page.
    ///
    /// `body` must be in Confluence storage format (XHTML).
    pub async fn create_page(
        &self,
        space_id: &str,
        parent_id: Option<&str>,
        title: &str,
        body: &str,
    ) -> Result<ConfluencePage> {
        let url = format!("{}/pages", self.base_url);

        let mut payload = serde_json::json!({
            "spaceId": space_id,
            "status": "current",
            "title": title,
            "body": {
                "representation": "storage",
                "value": body,
            },
        });
        if let Some(pid) = parent_id {
            payload["parentId"] = serde_json::Value::String(pid.to_string());
        }

        let raw: RawPage = ensure_ok(
            self.track_response(
                self.client
                    .post(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .json(&payload)
                    .send()
                    .await
                    .context("Failed to send Confluence create-page request")?,
            )?,
            "create-page",
        )
        .await?
        .json()
        .await
        .context("Failed to parse Confluence create-page response")?;

        Ok(raw.into_public(&self.wiki_base))
    }

    /// Update an existing page's title and/or body.
    ///
    /// `version_number` must be the **current** version number of the page;
    /// the API automatically increments it. Passing a stale number returns 409.
    pub async fn update_page(
        &self,
        page_id: &str,
        version_number: i64,
        title: &str,
        body: &str,
    ) -> Result<ConfluencePage> {
        let url = format!("{}/pages/{}", self.base_url, page_id.trim());

        let payload = serde_json::json!({
            "id": page_id,
            "status": "current",
            "title": title,
            "body": {
                "representation": "storage",
                "value": body,
            },
            "version": {
                "number": version_number + 1,
            },
        });

        let raw: RawPage = ensure_ok(
            self.track_response(
                self.client
                    .put(&url)
                    .header("Authorization", &self.auth_header)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .json(&payload)
                    .send()
                    .await
                    .context("Failed to send Confluence update-page request")?,
            )?,
            "update-page",
        )
        .await?
        .json()
        .await
        .context("Failed to parse Confluence update-page response")?;

        Ok(raw.into_public(&self.wiki_base))
    }

    /// Upload a local file as an attachment to a Confluence page.
    ///
    /// Uses the v1 REST API (`/rest/api/content/{id}/child/attachment`).
    ///
    /// # Security
    /// The file path is canonicalized and checked against a blocklist of sensitive
    /// directories to prevent exfiltration of secrets.
    pub async fn upload_attachment(
        &self,
        page_id: &str,
        file_path: &str,
    ) -> Result<ConfluenceAttachment> {
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
            .with_context(|| format!("Failed to read attachment file: {file_path}"))?;

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
            "{}/rest/api/content/{}/child/attachment",
            self.wiki_base,
            page_id.trim()
        );

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime)
            .context("Invalid MIME type")?;
        let form = reqwest::multipart::Form::new().part("file", part);

        let resp: AttachmentV1Response = ensure_ok(
            self.track_response(
                self.client
                    .post(&url)
                    .header("Authorization", &self.auth_header)
                    .header("X-Atlassian-Token", "nocheck")
                    .multipart(form)
                    .send()
                    .await
                    .context(
                        "Failed to send Confluence upload-attachment request",
                    )?,
            )?,
            "upload-attachment",
        )
        .await?
        .json()
        .await
        .context("Failed to parse Confluence upload-attachment response")?;

        resp.results
            .into_iter()
            .next()
            .map(|r| r.into_public(&self.wiki_base))
            .context("No attachment returned from upload")
    }

    /// List all attachments on a Confluence page.
    ///
    /// Uses the v1 REST API and handles pagination via `_links.next`.
    pub async fn list_attachments(
        &self,
        page_id: &str,
    ) -> Result<Vec<ConfluenceAttachment>> {
        let mut all = Vec::new();
        let mut url = format!(
            "{}/rest/api/content/{}/child/attachment?limit=250",
            self.wiki_base,
            page_id.trim()
        );

        loop {
            let resp: AttachmentV1Response = ensure_ok(
                self.track_response(
                    self.client
                        .get(&url)
                        .header("Authorization", &self.auth_header)
                        .header("Accept", "application/json")
                        .send()
                        .await
                        .context(
                            "Failed to send Confluence list-attachments request",
                        )?,
                )?,
                "list-attachments",
            )
            .await?
            .json()
            .await
            .context("Failed to parse Confluence list-attachments response")?;

            let has_next = resp
                .links
                .as_ref()
                .and_then(|l| l.next.as_ref())
                .cloned();

            all.extend(
                resp.results
                    .into_iter()
                    .map(|r| r.into_public(&self.wiki_base)),
            );

            match has_next {
                Some(next) if next.starts_with("http") => url = next,
                Some(next) => {
                    url = format!(
                        "{}{}",
                        self.wiki_base.trim_end_matches('/'),
                        next,
                    );
                }
                None => break,
            }
        }

        Ok(all)
    }

    /// Fetch a Confluence attachment by its download URL and return it as a
    /// base64 data URI for inline display.
    ///
    /// # Security
    /// Validates that `download_url` belongs to the configured Confluence
    /// instance to prevent SSRF attacks.
    pub async fn fetch_attachment_data_uri(
        &self,
        download_url: &str,
        mime_type: &str,
    ) -> Result<String> {
        use base64::{engine::general_purpose::STANDARD, Engine};

        if !download_url.starts_with(&self.wiki_base) {
            bail!(
                "Attachment URL must belong to the configured Confluence \
                 instance (expected prefix '{}')",
                self.wiki_base
            );
        }

        let bytes = self
            .client
            .get(download_url)
            .header("Authorization", &self.auth_header)
            .send()
            .await
            .context("Failed to fetch Confluence attachment")?
            .error_for_status()
            .context("Confluence attachment fetch returned an error status")?
            .bytes()
            .await
            .context("Failed to read Confluence attachment bytes")?;

        let encoded = STANDARD.encode(&bytes);
        Ok(format!("data:{mime_type};base64,{encoded}"))
    }
}
