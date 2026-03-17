# GitHub Repository Health Report

## Overview

Add a new "Health" view mode to the package dashboard that surfaces GitHub repository health metrics — issues created/closed, PR activity, response times, and contributor activity over the last 30 days. Data is fetched via a GitHub App using the GraphQL API, snapshotted daily, cached at the repo level, and computed per filter configuration.

## Data Model

### `github_installations`

Tracks GitHub App installations at the org/user-account level.

| Column | Type | Notes |
|--------|------|-------|
| id | PK | Internal ID |
| installation_id | integer | GitHub's installation ID (not secret) |
| owner | text | Org or user account name |
| owner_type | text | `"Organization"` or `"User"` |
| encrypted_access_token | blob, nullable | AES-256-GCM encrypted |
| token_expires_at | timestamp, nullable | |
| created_at | timestamp | |
| updated_at | timestamp | |

### `github_repos`

Tracks GitHub repositories associated with npm packages.

| Column | Type | Notes |
|--------|------|-------|
| id | PK | Internal ID |
| installation_id | FK → github_installations, nullable | Null if app not installed for this owner |
| owner | text | e.g., `"facebook"` |
| name | text | e.g., `"react"` |
| created_at | timestamp | |
| updated_at | timestamp | |

### `github_repo_packages`

Join table linking repos to npm packages with optional filter configuration.

| Column | Type | Notes |
|--------|------|-------|
| repo_id | FK → github_repos | |
| package_name | text | e.g., `"@angular/core"` |
| filter_config | JSON, nullable | e.g., `{"labels": ["bug", "pkg:core"]}` |
| is_maintainer_override | boolean | True if manually linked by maintainer |

### `github_health_snapshots`

Raw data captured daily per repo.

| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| repo_id | FK → github_repos | |
| snapshot_date | DATE | |
| raw_data | JSON | Full GraphQL response for reprocessing |
| created_at | timestamp | |

Unique constraint on `(repo_id, snapshot_date)`.

### `github_health_metrics`

Computed metrics per snapshot per filter configuration.

| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| snapshot_id | FK → github_health_snapshots | |
| repo_id | FK → github_repos | |
| filter_config | JSON, nullable | Null = unfiltered (all issues/PRs) |
| issues_opened_30d | integer | |
| issues_closed_30d | integer | |
| prs_opened_30d | integer | |
| prs_merged_30d | integer | |
| prs_closed_unmerged_30d | integer | |
| median_issue_first_response_hours | real | First human (non-bot) response |
| median_issue_close_hours | real | |
| median_pr_first_review_hours | real | First human review |
| median_pr_merge_hours | real | |
| active_contributors_30d | integer | |
| stale_issues_count | integer | Open > 90 days, no recent activity |
| created_at | timestamp | |

### `github_bot_patterns`

Admin-managed bot detection patterns.

| Column | Type | Notes |
|--------|------|-------|
| id | PK | |
| pattern_type | text | `"username"`, `"email"`, or `"username_suffix"` |
| pattern_value | text | e.g., `"dependabot[bot]"`, `"[bot]"`, `"noreply@github.com"` |
| created_by | text | User ID of admin who added it |
| created_at | timestamp | |

**Seeded defaults:**
- `username_suffix`: `[bot]`
- `email`: `noreply@github.com`

## GitHub App Authentication

### App Credentials (env vars, never in DB)

- `GITHUB_APP_ID` — The app's numeric ID
- `GITHUB_APP_PRIVATE_KEY` — RSA private key for signing JWTs
- `ENCRYPTION_KEY` — 32-byte hex-encoded key for AES-256-GCM

### Token Lifecycle

1. **App-level JWT**: Generated on-demand from private key. 10-minute TTL. Used to create installation tokens and as fallback for repos without installations. Never stored.

2. **Installation access tokens**: Requested via `POST /app/installations/{id}/access_tokens`. 1-hour TTL. Stored encrypted in `github_installations.encrypted_access_token`.

3. **Refresh flow**: Before any API call, check `token_expires_at`. If expired or within 5-minute buffer, generate new JWT, request new installation token, encrypt and update DB. Atomic — encrypt before write, never store plaintext.

### Encryption

- Algorithm: AES-256-GCM
- Storage format: `Buffer(12-byte nonce | ciphertext | 16-byte auth tag)` as a blob column
- Key source: `ENCRYPTION_KEY` env var
- No base64 encoding — raw binary in DB

### Security Boundaries

- Private key never leaves env vars, only used in-memory for JWT signing
- Installation tokens encrypted at rest, decrypted only at call time
- No tokens in logs or error messages
- Token refresh is atomic

## GraphQL Query Strategy

### Main Query

Single query per repo fetches all data needed for metric computation:

- Issues created since 30 days ago (with timeline items for first response)
- Issues closed since 30 days ago
- PRs created since 30 days ago (with reviews for first review time)
- PR merge/close status

Pagination via cursors for repos with >100 items in the 30-day window.

### Label Filtering

When `filter_config` includes labels, the GraphQL query adds `labels` filter arguments. Different filter configs for the same repo result in separate queries but share the same snapshot's `raw_data`.

### Bot Filtering

Applied at metric computation time, not query time. Raw data includes all comments/reviews.

**Filtering priority:**
1. `author.__typename === "Bot"` — GitHub's own classification
2. Exact username match against `github_bot_patterns` (`pattern_type = "username"`)
3. Username suffix match (`pattern_type = "username_suffix"`)
4. Email match (`pattern_type = "email"`)

Bot patterns are loaded once per snapshot run and cached in memory.

## Cron Job

Integrated into existing `apps/cronjob`. Runs daily.

### Flow

1. Query `github_repos` joined with `github_repo_packages` — only repos with tracked packages
2. Skip repos with a snapshot for today
3. For each repo:
   - Resolve auth: check `github_installations` for owner → refresh token if needed → fall back to app JWT
   - Execute GraphQL query with pagination
   - Insert `github_health_snapshots` row with `raw_data`
   - Compute unfiltered metrics → insert `github_health_metrics` row with `filter_config = null`
   - For each distinct `filter_config` across packages pointing to this repo → compute filtered metrics → insert row
4. Rate limit tracking: monitor response headers, pause if approaching limit

### Error Handling

- Repo not found: log warning, skip, don't remove from DB
- Auth failure: log, skip, retry next cycle
- Partial failure: snapshot what succeeded, mark as partial

## Frontend

### Health View Mode

New `"health"` value added to the view mode type: `'sunburst' | 'adoption' | 'volume' | 'migration' | 'lifecycle' | 'health'`

### Data Fetching

New telefunc `onGetHealthMetrics(packageName)`:
1. Resolve package → repo via `github_repo_packages`
2. Look up `filter_config` for this package (null if none set)
3. Query `github_health_metrics` for this repo + filter config, ordered by snapshot date
4. Return array of metric snapshots + repo info

### Accordion Layout

Each metric gets an expandable accordion row:

**Collapsed:** Metric label | Current value | Inline sparkline (last ~30 snapshots)

**Expanded:** Full D3 line chart with axes, tooltips, and hover interactions showing the metric over all available snapshots.

Multiple rows can be expanded simultaneously.

**Metric rows (12 total):**
1. Issues Opened (30d)
2. Issues Closed (30d)
3. Open/Close Ratio
4. Median Issue First Response Time
5. Median Issue Close Time
6. PRs Opened (30d)
7. PRs Merged (30d)
8. PRs Closed Unmerged (30d)
9. Median PR First Review Time
10. Median PR Merge Time
11. Active Contributors (30d)
12. Stale Issues (open > 90d)

### Sparklines

Minimal inline SVG — no axes, no labels, just the trend shape. Provides instant visual read on direction.

### Empty State

If no repo detected from npm metadata: "No linked repository found."

## Usage Page Integration

The existing usage page (`/usage`) shows tracked packages for the logged-in user. Health metrics will be surfaced here as well — each tracked package row can show a summary health indicator, with a link to the full health view on the package dashboard.

## Maintainer Experience

### GitHub App Installation Prompt

After login, the backend checks if the user maintains any tracked packages whose repos lack a GitHub App installation. If so, a one-time modal explains benefits and offers an install link with a dismiss option. Dismissal is stored in user preferences.

### Maintainer Settings (Health View)

When a maintainer views their package's health tab, a settings gear appears allowing:
- Override repo association (if auto-detected is wrong)
- Configure `filter_config` (add/remove label filters)
- Preview matching issues before saving

Changes trigger backfill recomputation from existing `raw_data`.

### Non-Maintainer Experience

- Health view works with unfiltered metrics for the auto-detected repo
- No settings, no override options
- Missing repo → empty state

## Repo Auto-Detection

npm packages expose a `repository` field in registry metadata. We parse the GitHub `owner/repo` from that URL automatically. Maintainers can override via the settings panel if the auto-detected value is incorrect (e.g., monorepos, forks, missing metadata).
