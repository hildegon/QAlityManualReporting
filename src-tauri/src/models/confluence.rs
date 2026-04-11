use serde::{Deserialize, Serialize};

/// An attachment on a Confluence page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfluenceAttachment {
    pub id: String,
    pub title: String,
    /// Absolute download URL for the attachment content.
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    /// MIME type (e.g. "image/png").
    #[serde(rename = "mediaType")]
    pub media_type: String,
}

/// A Confluence Cloud space.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfluenceSpace {
    pub id: String,
    pub key: String,
    pub name: String,
    /// `"global"` or `"personal"`.
    #[serde(rename = "spaceType")]
    pub space_type: String,
    /// ID of the space's homepage (root page).
    #[serde(rename = "homepageId")]
    pub homepage_id: Option<String>,
}

/// A Confluence Cloud page (v2 API shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfluencePage {
    pub id: String,
    pub title: String,
    #[serde(rename = "spaceId")]
    pub space_id: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    /// Storage-format XHTML body (only present when `body-format=storage` is requested).
    #[serde(default)]
    pub body_storage: Option<String>,
    /// Current version number (needed for updates).
    #[serde(default)]
    pub version_number: Option<i64>,
    /// Full web URL for opening the page in a browser.
    #[serde(default)]
    pub web_url: Option<String>,
}

/// A child item in the Confluence content tree.
///
/// Returned by the `direct-children` endpoints, which can contain pages,
/// folders, whiteboards, databases, etc. We only expose pages and folders
/// to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfluenceChild {
    pub id: String,
    pub title: String,
    /// `"page"` or `"folder"` (other types are filtered out).
    #[serde(rename = "contentType")]
    pub content_type: String,
    #[serde(rename = "spaceId")]
    pub space_id: String,
}

// ── Raw API response types (internal) ────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct SpacesResponse {
    pub results: Vec<RawSpace>,
    #[serde(rename = "_links")]
    pub links: Option<PaginationLinks>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawSpace {
    pub id: String,
    pub key: String,
    pub name: String,
    /// Confluence v2 API returns `"global"` or `"personal"`.
    #[serde(rename = "type", default)]
    pub space_type: Option<String>,
    /// Homepage ID (root page of the space).
    #[serde(rename = "homepageId", default)]
    pub homepage_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PagesResponse {
    pub results: Vec<RawPage>,
    #[serde(rename = "_links")]
    pub links: Option<PaginationLinks>,
}

/// Response from `/pages/{id}/direct-children` or `/folders/{id}/direct-children`.
#[derive(Debug, Deserialize)]
pub(crate) struct ChildrenResponse {
    pub results: Vec<RawChild>,
    #[serde(rename = "_links")]
    pub links: Option<PaginationLinks>,
}

/// A single child item from the `direct-children` endpoint.
#[derive(Debug, Deserialize)]
pub(crate) struct RawChild {
    pub id: String,
    pub title: String,
    /// Content type: `"page"`, `"folder"`, `"whiteboard"`, `"database"`, `"embed"`, etc.
    #[serde(rename = "type", default)]
    pub content_type: Option<String>,
    #[serde(rename = "spaceId", default)]
    pub space_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawPage {
    pub id: String,
    pub title: String,
    #[serde(rename = "spaceId")]
    pub space_id: String,
    #[serde(rename = "parentId")]
    pub parent_id: Option<String>,
    pub body: Option<RawBody>,
    pub version: Option<RawVersion>,
    #[serde(rename = "_links")]
    pub links: Option<PageLinks>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawBody {
    pub storage: Option<StorageBody>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct StorageBody {
    pub value: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawVersion {
    pub number: i64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PageLinks {
    #[serde(rename = "webui")]
    pub web_ui: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PaginationLinks {
    pub next: Option<String>,
}

// ── Attachment v1 API response types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct AttachmentV1Response {
    pub results: Vec<RawAttachmentV1>,
    #[serde(rename = "_links")]
    pub links: Option<PaginationLinks>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawAttachmentV1 {
    pub id: String,
    pub title: String,
    pub metadata: Option<AttachmentMetadata>,
    #[serde(rename = "_links")]
    pub links: Option<AttachmentLinks>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AttachmentMetadata {
    #[serde(rename = "mediaType")]
    pub media_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AttachmentLinks {
    pub download: Option<String>,
}

impl RawAttachmentV1 {
    pub fn into_public(self, wiki_base: &str) -> ConfluenceAttachment {
        let download_url = self
            .links
            .and_then(|l| l.download)
            .map(|path| format!("{}{}", wiki_base.trim_end_matches('/'), path))
            .unwrap_or_default();
        let media_type = self
            .metadata
            .and_then(|m| m.media_type)
            .unwrap_or_else(|| "application/octet-stream".to_string());
        ConfluenceAttachment {
            id: self.id,
            title: self.title,
            download_url,
            media_type,
        }
    }
}

impl RawSpace {
    pub fn into_public(self) -> ConfluenceSpace {
        ConfluenceSpace {
            id: self.id,
            key: self.key,
            name: self.name,
            space_type: self.space_type.unwrap_or_else(|| "global".to_string()),
            homepage_id: self.homepage_id,
        }
    }
}

impl RawChild {
    /// Convert to public `ConfluenceChild`, returning `None` for unsupported
    /// content types (whiteboards, databases, embeds, etc.).
    pub fn into_public(self) -> Option<ConfluenceChild> {
        let ct = self.content_type.as_deref().unwrap_or("page");
        if ct != "page" && ct != "folder" {
            return None;
        }
        Some(ConfluenceChild {
            id: self.id,
            title: self.title,
            content_type: ct.to_string(),
            space_id: self.space_id.unwrap_or_default(),
        })
    }
}

impl RawPage {
    pub fn into_public(self, wiki_base: &str) -> ConfluencePage {
        let web_url = self
            .links
            .as_ref()
            .and_then(|l| l.web_ui.as_ref())
            .map(|path| format!("{}{}", wiki_base.trim_end_matches('/'), path));

        ConfluencePage {
            id: self.id,
            title: self.title,
            space_id: self.space_id,
            parent_id: self.parent_id,
            body_storage: self.body.and_then(|b| b.storage.map(|s| s.value)),
            version_number: self.version.map(|v| v.number),
            web_url,
        }
    }
}
