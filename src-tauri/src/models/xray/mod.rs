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
