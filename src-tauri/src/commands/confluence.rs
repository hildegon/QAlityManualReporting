use tauri::AppHandle;

use crate::{
    api::confluence_client::ConfluenceClient,
    commands::config::load_config,
    models::confluence::{
        ConfluenceAttachment, ConfluenceChild, ConfluencePage, ConfluenceSpace,
    },
    state::ApiUsageState,
};

fn format_err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

/// Build a `ConfluenceClient` from the persisted Jira credentials.
///
/// Confluence Cloud uses the same Atlassian email + API token as Jira,
/// so no extra credentials are required.
fn make_confluence_client(app: &AppHandle) -> Result<ConfluenceClient, String> {
    use tauri::Manager;
    let config = load_config(app).map_err(format_err)?;
    if !config.is_jira_configured() {
        return Err(
            "Jira is not configured. Confluence uses the same Atlassian credentials — \
             please set Jira URL, Email, and API Token in Settings."
                .into(),
        );
    }
    let usage = app.state::<ApiUsageState>().confluence_usage();
    Ok(ConfluenceClient::new(
        &config.jira_url,
        &config.jira_email,
        &config.jira_api_token,
        usage,
    ))
}

/// List all Confluence spaces visible to the authenticated user.
#[tauri::command]
pub async fn list_confluence_spaces(app: AppHandle) -> Result<Vec<ConfluenceSpace>, String> {
    let client = make_confluence_client(&app)?;
    client.list_spaces().await.map_err(format_err)
}

/// List pages in a Confluence space (root pages if `parent_id` is `None`,
/// otherwise children of the given parent).
#[tauri::command]
pub async fn list_confluence_pages(
    app: AppHandle,
    space_id: String,
    parent_id: Option<String>,
) -> Result<Vec<ConfluencePage>, String> {
    let client = make_confluence_client(&app)?;
    client
        .list_pages(&space_id, parent_id.as_deref())
        .await
        .map_err(format_err)
}

/// List direct children (pages + folders) of a page or folder.
///
/// `parent_type` must be `"page"` or `"folder"`.
#[tauri::command]
pub async fn list_confluence_children(
    app: AppHandle,
    parent_id: String,
    parent_type: String,
) -> Result<Vec<ConfluenceChild>, String> {
    let client = make_confluence_client(&app)?;
    client
        .list_children(&parent_id, &parent_type)
        .await
        .map_err(format_err)
}

/// Fetch a single Confluence page (with storage-format body).
#[tauri::command]
pub async fn get_confluence_page(
    app: AppHandle,
    page_id: String,
) -> Result<ConfluencePage, String> {
    let client = make_confluence_client(&app)?;
    client.get_page(&page_id).await.map_err(format_err)
}

/// Create a new Confluence page under the given space (and optional parent).
#[tauri::command]
pub async fn create_confluence_page(
    app: AppHandle,
    space_id: String,
    parent_id: Option<String>,
    title: String,
    body: String,
) -> Result<ConfluencePage, String> {
    let client = make_confluence_client(&app)?;
    client
        .create_page(&space_id, parent_id.as_deref(), &title, &body)
        .await
        .map_err(format_err)
}

/// Update an existing Confluence page's title and body.
#[tauri::command]
pub async fn update_confluence_page(
    app: AppHandle,
    page_id: String,
    version_number: i64,
    title: String,
    body: String,
) -> Result<ConfluencePage, String> {
    let client = make_confluence_client(&app)?;
    client
        .update_page(&page_id, version_number, &title, &body)
        .await
        .map_err(format_err)
}

/// Upload a file as an attachment to a Confluence page.
#[tauri::command]
pub async fn upload_confluence_attachment(
    app: AppHandle,
    page_id: String,
    file_path: String,
) -> Result<ConfluenceAttachment, String> {
    let client = make_confluence_client(&app)?;
    client
        .upload_attachment(&page_id, &file_path)
        .await
        .map_err(format_err)
}

/// List all attachments on a Confluence page.
#[tauri::command]
pub async fn list_confluence_attachments(
    app: AppHandle,
    page_id: String,
) -> Result<Vec<ConfluenceAttachment>, String> {
    let client = make_confluence_client(&app)?;
    client
        .list_attachments(&page_id)
        .await
        .map_err(format_err)
}

/// Fetch a Confluence attachment as a base64 data URI for inline display.
#[tauri::command]
pub async fn fetch_confluence_attachment(
    app: AppHandle,
    download_url: String,
    mime_type: String,
) -> Result<String, String> {
    let client = make_confluence_client(&app)?;
    client
        .fetch_attachment_data_uri(&download_url, &mime_type)
        .await
        .map_err(format_err)
}

/// Copy specific attachments from one Confluence page to another.
///
/// Downloads each named file from the source page and re-uploads it to the
/// target page, preserving the original filename and MIME type.
/// Returns the number of successfully copied attachments.
#[tauri::command]
pub async fn copy_confluence_attachments(
    app: AppHandle,
    source_page_id: String,
    target_page_id: String,
    filenames: Vec<String>,
) -> Result<u32, String> {
    let client = make_confluence_client(&app)?;
    client
        .copy_attachments_between_pages(&source_page_id, &target_page_id, &filenames)
        .await
        .map_err(format_err)
}
