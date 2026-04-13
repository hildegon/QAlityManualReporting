#![allow(dead_code)]

use serde::Deserialize;

mod shared;
mod test;
mod test_execution;
mod test_health;
mod test_plan;
mod test_run;
mod test_set;

pub use shared::*;
pub use test::*;
pub use test_execution::*;
pub use test_health::*;
pub use test_plan::*;
pub use test_run::*;
pub use test_set::*;

use serde::Deserializer;

/// Deserialize a sequence that may be `null` in JSON as an empty `Vec`.
/// `#[serde(default)]` only handles *missing* fields; if the field is present
/// but explicitly `null`, this helper treats it as an empty collection instead.
fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::deserialize(deserializer)?.unwrap_or_default())
}

/// Xray Cloud GraphQL returns the `jira` field as a JSON-encoded string.
/// This deserializer handles both forms: a raw string that needs parsing,
/// or an already-parsed object (for forward-compatibility).
fn deserialize_jira_json<'de, T, D>(deserializer: D) -> Result<T, D::Error>
where
    T: serde::de::DeserializeOwned,
    D: Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => serde_json::from_str(&s).map_err(serde::de::Error::custom),
        other => serde_json::from_value(other).map_err(serde::de::Error::custom),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Shared struct deserialization ─────────────────────────────────────────

    #[test]
    fn xray_status_deserializes_from_json() {
        let json = r#"{"name": "PASS"}"#;
        let status: XrayStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "PASS");
    }

    #[test]
    fn xray_user_maps_camel_case_fields() {
        let json = r#"{"accountId": "abc123", "displayName": "Jane Doe"}"#;
        let user: XrayUser = serde_json::from_str(json).unwrap();
        assert_eq!(user.account_id.as_deref(), Some("abc123"));
        assert_eq!(user.display_name.as_deref(), Some("Jane Doe"));
    }

    #[test]
    fn xray_user_handles_null_optional_fields() {
        let json = r#"{"accountId": null, "displayName": null}"#;
        let user: XrayUser = serde_json::from_str(json).unwrap();
        assert!(user.account_id.is_none());
        assert!(user.display_name.is_none());
    }

    #[test]
    fn xray_page_info_maps_start_index() {
        let json = r#"{"startIndex": 10, "limit": 50, "total": 200}"#;
        let page: XrayPageInfo = serde_json::from_str(json).unwrap();
        assert_eq!(page.start_index, 10);
        assert_eq!(page.limit, 50);
        assert_eq!(page.total, 200);
    }

    #[test]
    fn latest_test_status_maps_final_field() {
        let json = r##"{"name": "PASS", "color": "#0f0", "description": "ok", "final": true}"##;
        let status: LatestTestStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "PASS");
        assert_eq!(status.is_final, Some(true));
    }

    #[test]
    fn latest_test_status_handles_missing_optional_fields() {
        let json = r#"{"name": "TODO"}"#;
        let status: LatestTestStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "TODO");
        assert!(status.color.is_none());
        assert!(status.is_final.is_none());
    }

    // ── deserialize_jira_json ─────────────────────────────────────────────────

    #[test]
    fn deserialize_jira_json_parses_json_encoded_string() {
        // Xray returns the `jira` field as a JSON-encoded string.
        let outer = r#"{"key": "{\"key\":\"T-1\",\"summary\":\"My test\"}"}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
            summary: String,
        }

        let result: Outer = serde_json::from_str(outer).unwrap();
        assert_eq!(result.key.key, "T-1");
        assert_eq!(result.key.summary, "My test");
    }

    #[test]
    fn deserialize_jira_json_accepts_pre_parsed_object() {
        // Forward-compat path: field is already a JSON object, not a string.
        let outer = r#"{"key": {"key":"T-2","summary":"Another"}}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
            summary: String,
        }

        let result: Outer = serde_json::from_str(outer).unwrap();
        assert_eq!(result.key.key, "T-2");
    }

    #[test]
    fn deserialize_jira_json_returns_error_on_invalid_inner_json() {
        let outer = r#"{"key": "not-valid-json{"}"#;

        #[derive(serde::Deserialize)]
        struct Outer {
            #[serde(deserialize_with = "super::deserialize_jira_json")]
            key: Inner,
        }
        #[derive(serde::Deserialize, Debug)]
        struct Inner {
            key: String,
        }

        let result: serde_json::Result<Outer> = serde_json::from_str(outer);
        assert!(result.is_err());
    }

    // ── TestRun serde ─────────────────────────────────────────────────────────

    #[test]
    fn test_run_status_deserializes_is_final() {
        let json = r#"{"name": "FAIL", "final": false}"#;
        let status: TestRunStatus = serde_json::from_str(json).unwrap();
        assert_eq!(status.name, "FAIL");
        assert_eq!(status.is_final, Some(false));
    }

    #[test]
    fn test_run_defects_defaults_to_empty_vec() {
        // Verify the #[serde(default)] on the defects field works correctly.
        let json = r#"{
            "id": "run-1",
            "status": {"name": "PASS"},
            "test": {"issueId": "t-1", "jira": "{\"key\":\"T-1\",\"summary\":\"s\"}"}
        }"#;
        let run: TestRun = serde_json::from_str(json).unwrap();
        assert!(run.defects.is_empty());
        assert!(run.parameters.is_empty());
    }

    // ── TestExecution serde ───────────────────────────────────────────────────

    #[test]
    fn fix_version_deserializes_id_and_name() {
        let json = r#"{"id": "10001", "name": "v2.0.0"}"#;
        let fv: FixVersion = serde_json::from_str(json).unwrap();
        assert_eq!(fv.id, "10001");
        assert_eq!(fv.name, "v2.0.0");
    }

    // ── TestPlan serde ────────────────────────────────────────────────────────

    #[test]
    fn test_plan_result_is_optional_with_warnings() {
        let json = r#"{"testPlan": null, "warnings": ["no tests added"]}"#;
        let result: CreateTestPlanResult = serde_json::from_str(json).unwrap();
        assert!(result.test_plan.is_none());
        assert_eq!(result.warnings.as_deref().unwrap(), &["no tests added"]);
    }
}
