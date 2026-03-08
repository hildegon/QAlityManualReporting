# Xray Cloud GraphQL API — Test Steps & Step-Level Results

Source: https://us.xray.cloud.getxray.app/doc/graphql/
API Endpoint: https://xray.cloud.getxray.app/api/v2/graphql

## 1. TestRun type (has `steps` field)

```graphql
type TestRun {
  id: String
  status: Status
  unstructured: String
  gherkin: String
  scenarioType: String
  comment: String
  startedOn: String
  evidence: [Evidence]
  defects: [String]
  steps: [TestRunStep]          # <-- the steps field
  examples: [Example]
  results: [Result]
  testType: TestType
  executedById: String
  assigneeId: String
  finishedOn: String
  preconditions(limit: Int!, start: Int): TestRunPreconditionResults
  test: Test
  testVersion: TestVersion
  testExecution: TestExecution
  lastModified: String
  customFields: [TestRunCustomFieldValue]
  parameters: [TestRunParameter]
  iterations(limit: Int!, start: Int): TestRunIterationResults
}
```

## 2. TestRunStep type

```graphql
type TestRunStep {
  id: String
  status: StepStatus
  action: String
  data: String
  result: String
  customFields: [TestRunCustomStepField]
  comment: String
  evidence: [Evidence]
  attachments: [Attachment]
  defects: [String]
  actualResult: String
}
```

## 3. StepStatus type (separate from test-run-level Status)

```graphql
type StepStatus {
  name: String
  description: String
  color: String
  testStatus: Status     # maps step status -> test status
}
```

## 4. Evidence type

```graphql
type Evidence {
  id: String
  filename: String
  storedInJira: Boolean
  downloadLink: String
  size: Int
  createdOn: String
}
```

## 5. TestRunCustomStepField type

```graphql
type TestRunCustomStepField {
  id: String
  name: String
  value: JSON
}
```

## 6. Queries for fetching test runs with steps

### getTestRun (by test + execution issue IDs)
```graphql
getTestRun(testIssueId: String, testExecIssueId: String): TestRun
```

### getTestRunById (by test run internal ID)
```graphql
getTestRunById(id: String): TestRun
```

### getStepStatuses (all available step statuses)
```graphql
getStepStatuses(projectId: String): [StepStatus]
```

## 7. Mutations for updating step results

### updateTestRunStep (comprehensive — status + comment + defects + evidence + actualResult)
```graphql
updateTestRunStep(
  testRunId: String!,
  stepId: String!,
  updateData: UpdateTestRunStepInput!,
  iterationRank: String
): UpdateTestRunStepResult
```

### updateTestRunStepStatus (status only, simpler)
```graphql
updateTestRunStepStatus(
  testRunId: String!,
  stepId: String!,
  status: String!,
  iterationRank: String
): UpdateTestRunStepStatusResult
```

### updateTestRunStepComment (comment only)
```graphql
updateTestRunStepComment(
  testRunId: String!,
  stepId: String!,
  comment: String!,
  iterationRank: String
): String
```

## 8. Input & Result types for mutations

### UpdateTestRunStepInput
```graphql
input UpdateTestRunStepInput {
  comment: String
  status: String
  evidence: TestRunEvidenceOperationsInput
  defects: TestRunDefectOperationsInput
  actualResult: String
}
```

### TestRunEvidenceOperationsInput
```graphql
input TestRunEvidenceOperationsInput {
  add: [AttachmentDataInput]
  removeIds: [String]
  removeFilenames: [String]
}
```

### TestRunDefectOperationsInput
```graphql
input TestRunDefectOperationsInput {
  add: [String]
  remove: [String]
}
```

### UpdateTestRunStepResult
```graphql
type UpdateTestRunStepResult {
  addedDefects: [String]
  removedDefects: [String]
  addedEvidence: [String]
  removedEvidence: [String]
  warnings: [String]
}
```

### UpdateTestRunStepStatusResult
```graphql
type UpdateTestRunStepStatusResult {
  warnings: [String]
}
```

## 9. Additional step-level mutations (evidence & defects)

- `addEvidenceToTestRunStep`
- `removeEvidenceFromTestRunStep`
- `addDefectsToTestRunStep`
- `removeDefectsFromTestRunStep`

## 10. Test Set / Test Plan membership mutations (IMPORTANT: scalar return types)

### addTestsToTestSet / addTestsToTestPlan — return OBJECTS
```graphql
addTestsToTestSet(issueId: String!, testIssueIds: [String]!): AddTestsToTestSetResult
addTestsToTestPlan(issueId: String!, testIssueIds: [String]!): AddTestsToPlanResult
```
These return objects with subfields: `{ addedTests warning }` — selection set IS required.

### removeTestsFromTestSet / removeTestsFromTestPlan — return SCALAR String
```graphql
removeTestsFromTestSet(issueId: String!, testIssueIds: [String]!): String
removeTestsFromTestPlan(issueId: String!, testIssueIds: [String]!): String
```
**These return a plain `String` scalar.** Do NOT select subfields — it will cause a 400 Bad Request:
`"Field must not have a selection since type String has no subfields"`

Correct usage (no selection set):
```graphql
mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String]!) {
    removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds)
}
```
