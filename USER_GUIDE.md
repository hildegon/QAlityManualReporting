# QAlity — User Guide

QAlity is a desktop application for reading Jira and Xray Cloud test data, marking test runs,
and writing results back to Xray — without needing a web server or browser extension.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First Launch — Settings](#first-launch--settings)
3. [Navigation](#navigation)
4. [Project Selector](#project-selector)
5. [Test Executions](#test-executions)
   - [Filtering the list](#filtering-the-list)
   - [Creating a new execution](#creating-a-new-execution)
   - [Editing an execution (status & assignee)](#editing-an-execution-status--assignee)
   - [Opening an execution](#opening-an-execution)
6. [Test Execution Detail](#test-execution-detail)
   - [Filtering test runs](#filtering-test-runs)
   - [Progress summary bar](#progress-summary-bar)
   - [Updating a test run status](#updating-a-test-run-status)
   - [Adding a comment](#adding-a-comment)
   - [Bulk status actions](#bulk-status-actions)
   - [Test steps](#test-steps)
7. [Test Plans](#test-plans)
   - [Adding tests to a test plan](#adding-tests-to-a-test-plan)
   - [Removing a test from a test plan](#removing-a-test-from-a-test-plan)
   - [Other actions](#other-actions)
8. [Test Sets](#test-sets)
   - [Adding tests to a test set](#adding-tests-to-a-test-set)
   - [Removing a test from a test set](#removing-a-test-from-a-test-set)
   - [Other actions](#other-actions-1)
9. [Create Test](#create-test)
10. [Rate Limiting](#rate-limiting)
11. [Credential Storage](#credential-storage)

---

## Prerequisites

- A **Jira Cloud** account with access to your test projects.
- An **Xray Cloud** subscription on the same Jira instance.
- An **Atlassian API token** — generate one at
  `https://id.atlassian.com/manage-profile/security/api-tokens`.
- An **Xray API key pair** (Client ID + Client Secret) — generated in Xray Cloud's
  *API Keys* settings page (`Apps › Xray › Settings › API Keys`).

---

## First Launch — Settings

When you open QAlity for the first time the app starts on the **Settings** page.
You must configure both sections before you can use the rest of the app.

### Jira Cloud

| Field | Description |
|---|---|
| **Jira URL** | Base URL of your Jira instance, e.g. `https://myorg.atlassian.net` |
| **Email** | Your Atlassian account email address |
| **API Token** | The API token generated on `id.atlassian.com` |

Click **Test connection** to verify the credentials. On success the app shows your
Jira display name next to the button.

### Xray Cloud

| Field | Description |
|---|---|
| **Client ID** | From Xray › API Keys settings |
| **Client Secret** | From Xray › API Keys settings |
| **Content Project Key** | Jira project key for Test Plans, Test Sets, and Tests (e.g. `QA`) |
| **Content Project Name** | Human-readable name shown in the app header |
| **Execution Project Key** | Jira project key for Test Executions. Leave blank to use the same as Content Project Key |
| **Execution Project Name** | Human-readable name for the execution project |

Click **Test connection** to verify the Xray OAuth2 credentials.

Click **Save settings** when both sections are configured.

> **Tip:** You can return to Settings at any time using the gear icon in the navigation bar.
> Saving new credentials immediately resets all cached Xray data.

---

## Navigation

The fixed header at the top of the app contains:

- **QAlity** brand/logo on the left.
- **Project selector** (center-left) — a searchable dropdown listing all Jira projects;
  selecting one overrides the content project key for the current session.
- **Navigation links** on the right:
  - **Executions** — Test Execution list
  - **Test Plans** — Test Plan accordion
  - **Test Sets** — Test Set accordion
  - **Create Test** — Test issue creation form
  - **Settings** — Configuration

---

## Project Selector

The project selector appears in the header once Jira credentials are saved.
It shows the currently active project name (or the key configured in Settings if no
project has been selected manually).

Click the selector to open a searchable dropdown:

1. Type any part of a project name or key to filter the list.
2. Click a project to make it the active project.

The active project is persisted in `localStorage` and restored on restart.

> **How project keys interact with Settings:**
> - Content data (Plans, Sets, Tests): uses the selected project, falling back to
>   **Content Project Key** from Settings.
> - Execution data: uses **Execution Project Key** from Settings first; if that is blank,
>   falls back to the selected project and then **Content Project Key**.

---

## Test Executions

Navigate to **Executions** to see all Test Execution issues in your execution project.

Each row shows:

| Column | Description |
|---|---|
| **Key** | Jira issue key (e.g. `PROJ-42`) |
| **Summary** | Issue summary |
| **Status** | Jira workflow status badge |
| **Assignee** | Display name of the current assignee |
| **Actions** | Pencil icon to edit the execution |

### Filtering the list

- **Search box** — filters by key or summary (case-insensitive).
- **Show done** checkbox — by default, executions whose status is *Done*, *Won't Do*,
  *Closed*, or *Resolved* are hidden. Tick this checkbox to show them. The badge next
  to the checkbox shows how many are hidden.
- **Reload button** — manually refreshes the list from Jira/Xray.

### Creating a new execution

Click **New execution** (top right) to open the creation dialog:

1. Enter a **Summary** (required) and optional **Description**.
2. Optionally select a **Test Plan** from the dropdown.
3. Optionally pick **Test Sets** — use the filter box to narrow the list; click **Add**
   next to a set to include all its tests in the new execution.
4. Optionally select individual **Tests** from the searchable checkbox list. A badge
   shows how many tests are selected.
5. Click **Create** to submit.

### Editing an execution (status & assignee)

Click the **pencil icon** on any row to open the Edit dialog.

**Status transitions** — all available Jira workflow transitions are shown as pill buttons.
Clicking one immediately transitions the issue and closes the dialog.

**Assignee** — the current assignee is shown at the top of the section.

- Type at least **2 characters** in the search box to search Jira users (debounced 350ms).
- Results show the user's avatar and display name. Click a result to assign them.
- Click **Unassign** (shown when someone is currently assigned) to remove the assignee.

### Opening an execution

Click anywhere on a row (outside the pencil icon) to open the
[Test Execution Detail](#test-execution-detail) view.

---

## Test Execution Detail

This view replaces the execution list. Click the **← back arrow** to return.

The header shows the execution **key** and **summary**.

### Filtering test runs

- **Test-set filter pills** — one pill for *All*, one for *No set*, and one per test
  set that has runs in this execution (with a count badge). Click a pill to show only
  runs from that set.
- **Search box** — filters visible runs by test key or summary. Click the **×** to clear.

### Progress summary bar

A coloured bar below the filters shows the proportion of runs in each state:

| Colour | State |
|---|---|
| Green | Passed |
| Blue | Executing |
| Amber | Blocked |
| Red | Failed |

Counts for each state are displayed alongside the bar.

### Updating a test run status

Each row shows coloured status buttons on the right. Click one to update the run status
immediately. The update is applied **optimistically** — the UI reflects the new status
at once and rolls back if the API call fails.

### Adding a comment

Click the **comment icon** on a run row (turns blue if a comment already exists).
An inline text editor appears:

- Type the comment text.
- Press **Enter** or click **Save** to submit.
- Press **Escape** or click **Cancel** to discard.

### Bulk status actions

The **Set all:** buttons above the table apply a status to every run currently visible
(after test-set and search filters). Use these to quickly pass or fail a whole batch.

### Test steps

Click the **chevron** on the left of any row to expand the steps panel for that run.

Each step shows:
- Step number
- **Action**, **Test Data**, **Expected Result**, and **Actual Result** fields
- **Step status buttons** (colour-coded)
- A step-level comment field

Use **Set all steps:** buttons to apply a status to all steps in the run at once.

Navigate between steps with **↑ / ↓** or **j / k** keys when a step is focused.

---

### Loading more runs

The list loads runs in pages. Scroll near the bottom and the next page loads automatically.
A **Load more** button also appears at the bottom if more pages remain.

> All pages are loaded in the background automatically with a short delay between requests
> to avoid hitting Xray rate limits.

---

## Test Plans

Navigate to **Test Plans** to see all Test Plan issues in your content project.

The page is split into two panels:

- **Left — Test Sets:** lists all test sets for the project. Use the search box to filter.
- **Right — Test Plans:** lists all test plans as accordions with key, summary, and status badge.

### Adding tests to a test plan

1. In the **left panel**, select one or more test sets by clicking their checkboxes.
2. **Drag** the selected sets and **drop** them onto a test plan accordion in the right panel.
   A floating ghost shows how many sets are being dragged. The target plan highlights on hover.
3. On drop, all tests from the dragged sets are added to the plan. A toast confirms success or reports any error.

> Only test sets that are not already members are added; duplicates are ignored by Xray.

### Removing a test from a test plan

1. Expand a test plan by clicking its **chevron**.
2. Hover over any test row — a **trash icon** appears on the right.
3. Click the trash icon to remove that test from the plan. A spinner replaces the icon while
   the request is in flight; a toast confirms success or failure.

### Other actions

- Click **New Test Plan** (top right of the right panel) to create a new Test Plan issue
  (requires a summary).
- Use the **search box** inside an expanded plan to filter its tests by key or summary.
- Click the **reload** button to refresh from Xray.

---

## Test Sets

Navigate to **Test Sets** to see all Test Set issues in your content project.

The page is split into two panels:

- **Left — Tests:** lists all tests for the project. Use the search box to filter.
- **Right — Test Sets:** lists all test sets as accordions.

### Adding tests to a test set

1. In the **left panel**, select one or more tests by clicking their checkboxes.
2. **Drag** the selected tests and **drop** them onto a test set accordion in the right panel.
   A floating ghost shows how many tests are being dragged. The target set highlights on hover.
3. On drop, the tests are added to the set. A toast confirms success or reports any error.

> A hint label *"Drag selected tests onto a test set →"* appears above the test list
> whenever one or more tests are selected.

### Removing a test from a test set

1. Expand a test set by clicking its **chevron**.
2. Hover over any test row — a **trash icon** appears on the right.
3. Click the trash icon to remove that test from the set. A spinner replaces the icon while
   the request is in flight; a toast confirms success or failure.

### Other actions

- Click **New Test Set** to create a new Test Set issue (requires a summary).
- Use the **search box** inside an expanded set to filter its tests by key or summary.

---

## Create Test

Navigate to **Create Test** to create a new Test issue.

| Field | Description |
|---|---|
| **Summary** | Required. The test issue summary. |
| **Component** | Optional. Searchable panel listing all Jira components for the active project. Click one to select; shown as a chip. Falls back to a free-text field if Jira is not configured. |
| **Test Sets** | Optional. Searchable checkbox list. Selected sets are shown as chips with × remove buttons. The new test will be linked to all selected sets on creation. |
| **Steps** | Add numbered step cards (Action required, Test Data and Expected Result optional). Use the up/down arrows to reorder steps and the trash icon to remove them. |

Check **Continue creating** before submitting to keep your component and test-set selections
pre-filled after the test is created — useful for creating several tests in a row.

After a successful creation a green banner shows the new issue key. If any test-set links
fail, an amber warning lists the affected sets. Errors appear as a red banner.

---

## Rate Limiting

Xray Cloud enforces API rate limits. When a rate limit is hit:

- A **sticky amber banner** appears below the navigation bar showing a live countdown
  (e.g. *Rate limited — please wait 1m 30s*).
- The banner auto-dismisses when the cooldown expires and can also be dismissed manually.
- Any screen that was loading data when the rate limit was hit shows an amber box instead
  of a red error: *"Rate limited by Xray — Too many requests. Please wait ~Xs and try again."*

QAlity automatically staggers background page-loads (300ms between pages) to reduce the
chance of hitting rate limits.

---

## Credential Storage

All credentials are stored **locally on your machine**, encrypted with AES-256-GCM.

| Platform | Location |
|---|---|
| macOS | `~/Library/Application Support/qality/config.enc` |
| Windows | `%APPDATA%\qality\config.enc` |
| Linux | `~/.config/qality/config.enc` |

A 32-byte random encryption key is generated on first run and stored as `key.bin` in
the same directory. Credentials are never sent anywhere except to your own Jira/Xray
instance.
