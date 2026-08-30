# Health Tab: Sections and Duration Metrics

Supersedes the "Metric rows (12 total)" list and the never-implemented
response-time rows in the 2026-03-17 GitHub health report design.

## What changed and why

The Health tab was one flat accordion of eleven rows in no particular order.
It is now three titled sections — **Issues**, **Pull Requests**, **Other** —
and gains duration metrics that the original design promised but never
collected: how long open work has been sitting (backlog age), how long it
takes to resolve (close / merge time), and how long until a human first
responds.

Two facts about the data shaped the design:

1. **`raw_data` is a rolling 91-day window.** `mergeRawHealthData` prunes
   anything not updated in 91 days, so the oldest open issues — exactly the
   ones that dominate a P95 age — are not in it. Backlog age therefore needs
   its own fetch of every open item, stored on the snapshot.
2. **First-response metrics need comments and reviews**, which the delta
   fetch never requested. The GraphQL queries now pull the first ten comments
   (issues) and reviews (PRs) with author + timestamp, plus the item author so
   the author's own follow-ups are not counted as responses.

## Layout

Summary cards are unchanged. The accordion is grouped:

| Issues | Pull Requests | Other |
|---|---|---|
| Issues Opened | PRs Opened | Stars (Total / Δ) |
| Issues Closed | PRs Merged | Active Contributors |
| Close/Open Ratio | PRs Closed Unmerged | |
| Open Issues (Total / Δ) | Open PRs (Total / Δ) | |
| Stale Issues | Stale PRs | |
| Issue Backlog Age (Avg / P95) | PR Backlog Age (Avg / P95) | |
| Issue Resolution Time (Avg / Median / P95) | PR Merge Time (Avg / Median / P95) | |
| Issue First Response (Median) | PR First Review (Median) | |

### Variants replace the `cumulative` flag

A `MetricDefinition` has `variants: MetricVariant[]`. A variant owns its
`getValue`, `formatValue`, `hint`, toggle `label`, and an optional
`delta: true` meaning "series is the change from the prior snapshot". The
existing Total / Δ toggle on cumulative rows is now variants
`[{ Total }, { Δ, delta: true }]`; duration rows are `[{ Avg }, { P95 }]` or
`[{ Avg }, { Median }, { P95 }]`. One toggle component, one state per row;
the headline, sparkline, full chart and expanded hint all follow the
selected variant.

### Multi-series chart (2026-08-30)

The expanded chart draws **every** variant of a duration row, with the
selected one emphasised (thicker line, area fill, larger markers) and the
others as thin lines. A legend below the plot names each series with its
latest value and doubles as a second place to pick the headline stat. Rows
with a Δ variant (Open Issues, Open PRs, Stars) still draw only the selected
series — a total and its change are different units on one axis.

Colour follows the statistic, never the slot: `--chart-series-avg` (brand
red), `--chart-series-median` (blue), `--chart-series-p95` (amber), with
separate steps per theme validated as a categorical set (dark `#e04846 /
#388bfd / #bb8009` on `#161b22`, light `#cb3837 / #0969da / #9a6700` on
white; worst CVD ΔE ≥ 23). Hovering shows a crosshair and a tooltip with every
series' value at that snapshot.

X-axis labels thin to a uniform step counted back from the latest snapshot
(`pickAxisLabelIndexes`), and the two end labels anchor inward so they never
clip at the SVG edge.

### Nulls are gaps

Every new column is `null` on snapshots taken before it existed, and backlog
age is `null` whenever it could not be computed exactly (see below). The
series builders drop null points instead of coercing to `0`, so history does
not render as a cliff at the deploy date. Y-axis ticks use the row's
formatter so duration rows read `36h` / `12d` rather than raw hours.

## Metrics

All durations are hours, `null` when the population is empty. Percentiles
are nearest-rank on the ascending-sorted sample (`sorted[ceil(p·n) − 1]`);
"median" is `p = 0.5` under the same rule. Label filters apply to every
population.

| Metric | Population (trailing 30 days unless noted) | Stored as |
|---|---|---|
| Issue resolution time | issues closed in window; `closedAt − createdAt` | `avg_issue_close_hours`, `median_issue_close_hours`, `p95_issue_close_hours` |
| PR merge time | PRs merged in window; `mergedAt − createdAt` | `avg_pr_merge_hours`, `median_pr_merge_hours`, `p95_pr_merge_hours` |
| Issue first response | issues **created** in window that have a comment by a non-bot who is not the issue author; `firstSuchComment.createdAt − createdAt`. Issues with no such comment are excluded, not counted as zero. | `median_issue_first_response_hours` |
| PR first review | PRs created in window with a review by a non-bot who is not the PR author | `median_pr_first_review_hours` |
| Active contributors | distinct non-bot logins who authored a PR merged in window | `active_contributors_30d` |
| Issue backlog age | every open issue; `now − createdAt` | `avg_issue_age_hours`, `p95_issue_age_hours` |
| PR backlog age | every open PR | `avg_pr_age_hours`, `p95_pr_age_hours` |

Bot detection is `isBotActor` with the `github_bot_patterns` rows, which both
snapshot paths now actually pass to `computeHealthMetrics` (the app path
loaded them and threw them away; the cron path passed `[]`).

### Backlog age: the open-items fetch

`fetchGitHubOpenItems` pages `issues(states: [OPEN], orderBy: CREATED_AT ASC)`
and the same for `pullRequests`, 100 per page, requesting only
`number`, `createdAt`, and `labels`. A page of 100 costs about 21 rate-limit
points against a 5,000/hour budget, so a repo with 1,500 open issues is ~15
requests.

Pages are capped at `OPEN_ITEMS_PAGE_CAP = 30` per kind (3,000 items). The
ascending sort makes truncation degrade honestly:

- **Not truncated** → average and P95 are exact for any label filter.
- **Truncated, unfiltered** → the oldest 3,000 are present. P95 age is the
  item at rank `N − ceil(0.95·N)` from the oldest, which is exact as long as
  that rank is inside the fetched set (`N ≤ 60,000`). Average is unknowable
  and stays `null`.
- **Truncated, filtered** → both `null`. We do not know the filtered total,
  so no rank is trustworthy.

The result lives on the snapshot as
`repository.openIssues` / `repository.openPullRequests`, each
`{ items, totalCount, truncated }`. It is replaced wholesale every snapshot —
it is point-in-time state, not a delta — so `mergeRawHealthData` takes the
incoming collection when present and otherwise keeps the previous one.

### `raw_data` version 2

`RawGitHubHealthData.version` is now `2`. The first snapshot after deploy
finds a stored `raw_data` without `version === 2` and treats it as absent,
doing a full 91-day fetch instead of a delta. Without that, items not updated
since deploy would carry empty `comments` / `reviews` for up to 91 days and
silently read as "no response yet".

## Schema

Migration `2026-08-29_github_health_duration_stats` adds eight nullable
`REAL` columns to `github_health_metrics`:
`avg_issue_close_hours`, `p95_issue_close_hours`, `avg_pr_merge_hours`,
`p95_pr_merge_hours`, `avg_issue_age_hours`, `p95_issue_age_hours`,
`avg_pr_age_hours`, `p95_pr_age_hours`. The five dormant columns from the
original design are kept and now populated. Append-only, per
`compile-migrations.ts`.

## Snapshot paths

`apps/npm-burst/src/server/github-health-snapshot.ts` and
`apps/cronjob/src/github-health.ts` are still two copies of the same flow.
Both gain the version gate, the bot-pattern wiring, and the new columns. The
cron copy also gains the `fetchGitHubRepoSnapshotCounts` call it was missing
since 2026-04-30 — daily snapshots had been writing `0` for stars and open
counts unless someone pressed "Refresh with GitHub".

## Backfill

`tools/backfill-health-metrics.ts` recomputes the six close/merge duration
columns for every stored snapshot from its `raw_data` (which has always
carried `createdAt` / `closedAt` / `mergedAt`). Runs against a local SQLite
file (`D1_LOCAL_DB`, default `apps/npm-burst/local.db`); `--sql` prints the
`UPDATE` statements instead of applying them, for feeding to
`wrangler d1 execute --remote --file`. `pnpm db:backfill-health:remote`
(`tools/backfill-health-remote.sh`) does the whole prod round trip — export D1
to a temp SQLite file, generate, confirm, apply — since the TS script itself
never talks to D1. First-response, contributor and backlog-age columns cannot
be backfilled — the data was never fetched.

## Source data

"View source data" for the new rows: backlog age lists open items oldest
first with links and `ageHours`; resolution rows list the closed/merged
items with `hours`; first-response rows list items created in the window
with the responder and `hours` (or `null`); active contributors lists the
logins with their merged-PR counts. Each summary carries the computed stats
so the number on the row can be checked against the list.
