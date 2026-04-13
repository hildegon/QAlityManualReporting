import * as Dialog from "@radix-ui/react-dialog";
import {
  Info,
  X,
  PlayCircle,
  BookOpen,
  FlaskConical,
  BarChart2,
  Tag,
  FilePlus,
  Settings2,
  type LucideIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContentGroup {
  label: string;
  type: "list" | "tip" | "note";
  items: string[];
}

interface PageHelpContent {
  icon: LucideIcon;
  color: string;
  title: string;
  summary: string;
  intro: string;
  groups: ContentGroup[];
}

export type PageHelpId =
  | "executions"
  | "test-plans"
  | "tests"
  | "coverage"
  | "versions"
  | "create-test"
  | "settings";

// ── Content data ──────────────────────────────────────────────────────────────

const PAGE_HELP: Record<PageHelpId, PageHelpContent> = {
  executions: {
    icon: PlayCircle,
    color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40",
    title: "Test Executions",
    summary: "Record pass/fail results for your Xray test runs day-to-day.",
    intro:
      "Test Executions are the heart of day-to-day QA work. Each execution contains a set of test runs — one per test included — and this is where you record actual results, add evidence, and link defects back to Jira.",
    groups: [
      {
        label: "Managing executions",
        type: "list",
        items: [
          "Browse all executions in your Execution project (use the left project selector in the top bar to switch projects).",
          "Create a new execution: give it a summary, then optionally link it to a test plan, a fix version, and an environment label.",
          "Clone an existing execution — this duplicates the test list, saving time when re-running the same tests for a new build.",
          "Search executions by summary or key using the search box at the top of the list.",
        ],
      },
      {
        label: "Inside a test run",
        type: "list",
        items: [
          "Click any execution row to expand it and see all its test runs in a fast scrollable list.",
          "Click a status button (PASS / FAIL / TODO / BLOCKED) to update that run's overall result instantly.",
          "Add a free-text comment to any run to describe what was observed or why it failed.",
          "For manual tests: expand the Steps panel to mark each step individually and record actual result notes.",
          "For dataset-driven tests: expand the Iterations panel to set a status per dataset row and step.",
          "Link one or more Jira issue keys as defects directly to a test run — they appear as clickable badges.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Use the Execution project selector (top bar, left side) to separate executions in different Jira projects.",
          "Executions are sorted newest first. Clone + re-execute when your test list hasn't changed between builds.",
          "If status updates feel slow, Xray may be rate-limiting requests — a banner will appear at the top and the app will automatically retry.",
        ],
      },
    ],
  },

  "test-plans": {
    icon: BookOpen,
    color: "text-violet-500 bg-violet-50 dark:bg-violet-950/40",
    title: "Test Plans",
    summary: "Organise tests into plans and control what gets executed per release.",
    intro:
      "Test Plans in Xray group related tests for a specific release, feature, or sprint. Use this page to build and manage plans by dragging tests or whole test sets straight from the source panel — no browser needed.",
    groups: [
      {
        label: "Working with plans",
        type: "list",
        items: [
          "Browse all test plans in the Content project (use the right project selector in the top bar).",
          "Create a new plan with just a summary — you can add tests at any time.",
          "The left panel lists all test sets as source items; the right panel shows your plans as drop targets.",
          "Drag a test set row from the left onto a plan card to add all its tests to that plan at once.",
          "Drag individual tests if you need finer control over which tests belong to a plan.",
          "Remove tests from a plan by expanding it and clicking the × button next to the test row.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "A single test can belong to multiple plans — useful when one test covers several features.",
          "Test plans are referenced when creating executions, so you can scope an execution to exactly the tests in a plan.",
          "Use the Content project selector to manage plans in different Jira projects from the same app session.",
        ],
      },
    ],
  },

  tests: {
    icon: FlaskConical,
    color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
    title: "Tests & Test Sets",
    summary: "Browse your full test library, manage test sets, and keep tests organised.",
    intro:
      "This is your test library. All Xray tests in the Content project appear on the left; test sets are on the right as drop targets. Drag tests across to assign membership — no Xray UI required.",
    groups: [
      {
        label: "Finding and selecting tests",
        type: "list",
        items: [
          "Search tests by summary or issue key using the search bar above the test list.",
          "Filter by test type (Manual, Cucumber, Generic) using the type tabs.",
          "Select multiple tests using the checkbox column, then drag the entire selection onto a test set in one move.",
          "Membership badges (coloured dots) on each test row show which sets it already belongs to — hover a badge to see the set name.",
        ],
      },
      {
        label: "Managing test sets",
        type: "list",
        items: [
          "Create a new test set using the + button in the right panel header.",
          "Inline rename a test set by clicking its title directly — no dialog needed.",
          "Expand a test set to see all its member tests with their latest execution status.",
          "Remove a test from a set using the × button inside the expanded set view.",
          "Export the entire test list to CSV with the export button for offline analysis.",
        ],
      },
      {
        label: "Health tab — cleaning up deprecated tests",
        type: "list",
        items: [
          "Switch to the Health tab to surface tests with deprecating keywords (e.g. [DEPRECATED], OBSOLETE) in their summary.",
          "Bulk-select deprecated tests and use the Transition button to move them all to a new Xray status in a single action.",
          "This prevents deprecated tests from polluting coverage reports and test plans.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Drag-and-drop uses a custom implementation — it works reliably on macOS, Windows, and Linux.",
          "The test list is virtualised, so it stays fast even with thousands of tests in your project.",
        ],
      },
    ],
  },

  coverage: {
    icon: BarChart2,
    color: "text-orange-500 bg-orange-50 dark:bg-orange-950/40",
    title: "Coverage",
    summary: "Analyse pass/fail coverage across test sets and export shareable reports.",
    intro:
      "The Coverage page shows how well your test sets are covered by recent executions. Select one or more test sets to see a live breakdown of pass, fail, and not-yet-run tests — across a single set or many at once.",
    groups: [
      {
        label: "Selecting and viewing coverage",
        type: "list",
        items: [
          "Click one or more test set chips in the left sidebar to include them in the analysis.",
          "The Overall Dashboard shows total test count, pass %, fail count, TODO count, and a pie chart.",
          "Each selected test set gets its own collapsible section with individual tests and their latest statuses.",
          "Sort tests within a set by status, issue key, or summary; use the inline search to find a specific test.",
          "Click a status badge on a test to see which execution produced that result and when.",
        ],
      },
      {
        label: "Presets — saving your selection",
        type: "list",
        items: [
          "Click Save preset to store the current test-set selection under a custom name.",
          "Reload any preset with one click to instantly restore that selection — useful for standing reports.",
          "Rename or delete presets from the Presets sidebar on the right.",
          "Presets are saved locally and persist across app restarts.",
        ],
      },
      {
        label: "Analysis tab",
        type: "list",
        items: [
          "Failure Concentration: ranks tests by how often they fail — focus your attention where it matters most.",
          "Never Run: highlights tests that have never been executed — an invisible risk in your release.",
          "Insights: an overall health score with actionable suggestions based on the data.",
        ],
      },
      {
        label: "Exporting a report",
        type: "list",
        items: [
          "Click Export Report to generate a self-contained HTML file you can share or attach to a Jira issue.",
          "The report includes all charts, test statuses, and metadata — no internet needed to view it.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Combine multiple test sets to compare coverage across features or components side-by-side.",
          "Tests with no status have never been run — these are flagged in the Never Run panel.",
        ],
      },
    ],
  },

  versions: {
    icon: Tag,
    color: "text-rose-500 bg-rose-50 dark:bg-rose-950/40",
    title: "Versions",
    summary: "Full release dashboard — bugs, test health, Confluence feedback, and readiness.",
    intro:
      "The Versions page is your release command centre. Every Jira fix version gets a dashboard with bugs, test execution results, open issues, a release readiness checklist, and a live Confluence feedback board.",
    groups: [
      {
        label: "Navigating versions",
        type: "list",
        items: [
          "Click any version in the left sidebar to open its full dashboard on the right.",
          "Star a version (☆) to pin it to the top of the list for quick access.",
          "The KPI strip shows open bug count, critical bug count, test pass rate, and total issues at a glance.",
        ],
      },
      {
        label: "Bugs tab",
        type: "list",
        items: [
          "Filter bugs by priority: Critical, High, Medium, Low using the chip filters.",
          "Click a bug row to open a detail modal: description, attachments, linked issues, and comments.",
          "Transition a bug's Jira status (e.g. In Progress → Done) directly from the modal.",
          "Reassign a bug to another team member using the assignee picker inside the modal.",
        ],
      },
      {
        label: "Tests & release readiness",
        type: "list",
        items: [
          "The Tests tab lists all executions for this version and a failed-test analysis.",
          "Failed test analysis shows every failing run with the test key, summary, and which execution it belongs to.",
          "Release Readiness runs automatic criteria checks (e.g. no critical open bugs, pass rate above threshold) and shows a go / no-go summary.",
        ],
      },
      {
        label: "Feedback tab — Confluence integration",
        type: "list",
        items: [
          "Link a Confluence page to a version using the Link Page button — QAlity reads and writes to that page.",
          "Add structured issue cards with: description, priority, Jira ticket, assigned developer, comment, and status.",
          "Each card is written to the Confluence page as a formatted table row — your team sees it immediately.",
          "Toggle a card between Open and Resolved; edit any card inline and the page updates in real time.",
          "Jira ticket links in the Confluence table are clickable — readers can navigate straight to the issue.",
        ],
      },
      {
        label: "Managing versions",
        type: "list",
        items: [
          "Use Version Groups to combine related versions for a single consolidated report.",
          "The Manage tab lets you create, rename, release, archive, or delete fix versions.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Star your active sprint version so it stays at the top — especially useful with many historical versions.",
          "The Confluence Feedback tab is ideal for sprint retrospectives: write issues during the sprint and share the page with stakeholders.",
        ],
      },
    ],
  },

  "create-test": {
    icon: FilePlus,
    color: "text-teal-500 bg-teal-50 dark:bg-teal-950/40",
    title: "Create Test",
    summary: "Author a new Xray manual test with steps — without opening a browser.",
    intro:
      "Use this page to write a new Xray test and publish it straight to your Jira project. Once created it immediately appears in your test library and can be added to test sets, plans, and executions.",
    groups: [
      {
        label: "Creating a test",
        type: "list",
        items: [
          "Enter a clear, descriptive summary — this becomes the Jira issue title.",
          "Select the test type: Manual (numbered steps), Cucumber (BDD Gherkin), or Generic (free-form).",
          "For Manual tests: add numbered steps with Action, Expected Result, and optional Test Data columns.",
          "Drag step rows up or down to reorder them without deleting and re-creating.",
          "Delete an unwanted step using the × button on the right of each row.",
          "Click Create Test — the test is pushed to Jira and Xray immediately.",
        ],
      },
      {
        label: "After creating",
        type: "list",
        items: [
          "Go to the Tests page to assign the new test to one or more test sets.",
          "Add the test to a test plan via the Test Plans page, then create or update an execution.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Write Expected Results clearly: 'The login button is disabled and an error message is shown below the email field.'",
          "Use the Test Data column for inputs a tester needs (test account credentials, specific data values).",
          "Keep each step atomic — one action, one result. Long compound steps make it hard to pinpoint where a test failed.",
        ],
      },
    ],
  },

  settings: {
    icon: Settings2,
    color: "text-slate-500 bg-slate-100 dark:bg-slate-700/40",
    title: "Settings",
    summary: "Connect QAlity to your Jira and Xray Cloud workspace.",
    intro:
      "Settings is where you link QAlity to your Atlassian workspace. You need a working Jira connection and a working Xray connection to use all features. Credentials are encrypted and stored locally — nothing is sent to any QAlity server.",
    groups: [
      {
        label: "Jira Cloud credentials",
        type: "list",
        items: [
          "Jira URL: your Atlassian base URL, e.g. https://myorg.atlassian.net (no trailing slash).",
          "Email: the email address associated with your Atlassian account.",
          "API Token: a personal token from id.atlassian.com → Security → API tokens. This is not your Atlassian password.",
          "Click Test connection to verify — on success your Jira display name is shown.",
        ],
      },
      {
        label: "Xray Cloud credentials",
        type: "list",
        items: [
          "Client ID and Client Secret come from Xray Cloud → Global Settings → API Keys in your Jira instance.",
          "These are workspace-level keys — a Jira admin may need to create them for you.",
          "Click Test connection to authenticate via OAuth2 and confirm the keys are valid.",
        ],
      },
      {
        label: "Security",
        type: "note",
        items: [
          "Credentials are encrypted with AES-256-GCM and stored in your OS app-config directory.",
          "All API requests go directly from your machine to Atlassian's servers — QAlity has no backend and no telemetry.",
          "Saving new credentials clears all cached Jira and Xray data so the app re-fetches with the new identity.",
        ],
      },
      {
        label: "Tips",
        type: "tip",
        items: [
          "Credentials persist between sessions — only re-enter them if they change or expire.",
          "If you see '401 Unauthorized' errors, your Jira API token may have expired — generate a new one and re-save.",
          "The project selectors in the top bar are session-only; set them right after launching the app.",
        ],
      },
    ],
  },
};

// ── PageHelpButton ─────────────────────────────────────────────────────────────

export function PageHelpButton({ pageId }: { pageId: PageHelpId }) {
  const content = PAGE_HELP[pageId];
  const Icon = content.icon;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={`Help — ${content.title}`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
        >
          <Info className="h-4 w-4" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl outline-none dark:bg-slate-900"
          aria-describedby={`help-intro-${pageId}`}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${content.color}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {content.title}
              </Dialog.Title>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{content.summary}</p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* Intro */}
            <p
              id={`help-intro-${pageId}`}
              className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
            >
              {content.intro}
            </p>

            {/* Groups */}
            <div className="space-y-4">
              {content.groups.map((group, i) => (
                <HelpGroup key={i} group={group} />
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── HelpGroup ─────────────────────────────────────────────────────────────────

function HelpGroup({ group }: { group: ContentGroup }) {
  if (group.type === "tip") {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/50 dark:bg-blue-950/30">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0 1 1 0 002 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          Tips
        </p>
        <ul className="space-y-1.5">
          {group.items.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-blue-800 dark:text-blue-300">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (group.type === "note") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/30">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Note
        </p>
        <ul className="space-y-1.5">
          {group.items.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
              {item}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {group.label}
      </p>
      <ul className="space-y-2">
        {group.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <span className="mt-0.5 shrink-0 text-xs font-semibold text-slate-300 dark:text-slate-600">
              {i + 1}.
            </span>
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
