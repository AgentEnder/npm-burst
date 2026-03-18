# npm-burst

Analytics dashboard for npm packages, with snapshot-based package download history and GitHub repository health reporting.

## Local setup

### App env

Copy [apps/npm-burst/.env.local.example](/Users/agentender/repos/npm-burst/apps/npm-burst/.env.local.example) to `apps/npm-burst/.env.local` and fill in:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk frontend key used by Vite in the browser.
- `CLERK_PUBLISHABLE_KEY`: server-side publishable key if needed by server code or middleware.
- `CLERK_SECRET_KEY`: Clerk backend secret for authenticated telefunc requests.
- `TURSO_DATABASE_URL`: LibSQL/Turso database URL.
- `TURSO_AUTH_TOKEN`: Turso auth token.
- `ENCRYPTION_KEY`: 64 hex chars, used to encrypt GitHub installation access tokens before storing them in the DB.
- `GITHUB_APP_ID`: numeric GitHub App ID.
- `GITHUB_APP_SLUG`: app slug used to build the GitHub installation URL.
- `GITHUB_APP_PRIVATE_KEY`: GitHub App private key in PEM format. In `.env.local`, keep newline escapes as `\n`.
- `GITHUB_WEBHOOK_SECRET`: webhook signing secret used to verify `installation` and `installation_repositories` events.

Generate the local secrets with:

```bash
pnpm generate:secrets
```

That writes gitignored files into `./keys/`, split by destination:

- `keys/npm-burst.env` → copy into `apps/npm-burst/.env.local`
- `keys/cronjob.env` → copy into `apps/cronjob/.dev.vars`
- `keys/cloudflare.env` → set as Cloudflare secrets for deployed environments

`GITHUB_APP_PRIVATE_KEY` is different: GitHub generates that in the GitHub App settings when you create a private key.

### Clerk GitHub OAuth setup

The package Health view can now fall back to the signed-in user&apos;s GitHub account for one-off snapshots when a repo owner has not installed the GitHub App yet.

1. In the Clerk dashboard, enable GitHub as a social connection for your application.
2. Make sure the Clerk instance used by npm-burst has GitHub enabled for both sign-in and connected accounts in the user profile.
3. Use the same Clerk publishable and secret keys in npm-burst that point at that configured instance.
4. After signing in, open `/usage` and use the `Connect GitHub` button if your Clerk account was created without GitHub initially.

Once connected, npm-burst can request the user&apos;s GitHub OAuth access token from Clerk server-side and use it to fetch a one-off health snapshot for the repo currently being viewed.

### Cron worker env

Copy [apps/cronjob/.dev.vars.example](/Users/agentender/repos/npm-burst/apps/cronjob/.dev.vars.example) to `apps/cronjob/.dev.vars` for local Wrangler runs. The cron worker needs:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `ENCRYPTION_KEY`

`ENCRYPTION_KEY` must be identical in the app and cron environments or stored GitHub installation tokens cannot be decrypted and refreshed.

## Database setup

Run migrations against your Turso database:

```bash
pnpm exec tsx apps/npm-burst/src/server/migrate.ts
```

The GitHub health feature adds these tables:

- `github_installations`
- `github_repos`
- `github_repo_packages`
- `github_health_snapshots`
- `github_health_metrics`
- `github_bot_patterns`

## GitHub App setup

GitHub health snapshots use a GitHub App, not a personal access token.

1. A maintainer clicks the install link from the usage page.
2. In GitHub Developer Settings, create a new GitHub App.
3. Set the homepage URL to your deployed app.
4. Set the Setup URL to `https://your-domain.example/api/github/setup`.
5. Set the Webhook URL to `https://your-domain.example/api/github/webhook`.
6. Generate a webhook secret and copy it into `GITHUB_WEBHOOK_SECRET`.
7. Grant these repository permissions as read-only:
   - `Issues`
   - `Pull requests`
   - `Metadata`
8. Generate a private key.
9. Copy the app values into your env:
   - App ID -> `GITHUB_APP_ID`
   - App slug -> `GITHUB_APP_SLUG`
   - Private key PEM -> `GITHUB_APP_PRIVATE_KEY`
10. Run `pnpm generate:github-secrets` and copy:
   - `ENCRYPTION_KEY` into both the app env and cron env
   - `GITHUB_WEBHOOK_SECRET` into the app env and the GitHub App webhook secret field
11. Deploy the app and cron worker with those secrets configured.
12. From npm-burst's `/usage` page, click the install link for the GitHub owner you maintain.
13. Complete the GitHub App installation for that user or organization and grant access to the repos npm-burst should track.
14. GitHub redirects back to `/api/github/setup`, then sends `installation` or `installation_repositories` webhooks to `/api/github/webhook`.
15. npm-burst verifies the webhook, upserts `github_installations`, refreshes an installation token, and syncs accessible repositories into `github_repos.installation_id`.
16. The cron worker can now snapshot GitHub health data for those repos.

If the setup redirect succeeds but the app still shows the owner as uninstalled, check the webhook delivery logs in the GitHub App settings first.

## Cloudflare deployment secrets

Set secrets for the Pages app:

```bash
cd apps/npm-burst
wrangler pages secret put TURSO_DATABASE_URL
wrangler pages secret put TURSO_AUTH_TOKEN
wrangler pages secret put CLERK_SECRET_KEY
wrangler pages secret put ENCRYPTION_KEY
wrangler pages secret put GITHUB_APP_ID
wrangler pages secret put GITHUB_APP_SLUG
wrangler pages secret put GITHUB_APP_PRIVATE_KEY
wrangler pages secret put GITHUB_WEBHOOK_SECRET
```

Set secrets for the cron worker:

```bash
cd apps/cronjob
wrangler secret put TURSO_DATABASE_URL
wrangler secret put TURSO_AUTH_TOKEN
wrangler secret put ENCRYPTION_KEY
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY
```

Keep `ENCRYPTION_KEY` identical across both deployments.

## Running locally

Start the app:

```bash
pnpm nx serve npm-burst
```

If you want to run the cron worker locally through Wrangler:

```bash
cd apps/cronjob
wrangler dev
```

## Current GitHub health caveats

- Repo association is auto-detected from the npm `repository` field.
- If a package has no GitHub repository in npm metadata, the Health view stays empty.
- The cron snapshotter skips repos that do not yet have an installation synced from GitHub webhooks.
- If an app is installed on only selected repositories, repo access is updated from the installation repository sync rather than assumed for the whole owner.
- Signed-in users with a connected GitHub account can still fetch a one-off snapshot from the package Health view even if the GitHub App is not installed for that owner.
