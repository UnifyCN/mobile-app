# Supabase Changelog

## [Public Beta] Supabase Knowledge Base

2026-10-23 · New Feature · documentation · [supabase.com/changelog/kb-launch](https://supabase.com/changelog/kb-launch)

The Supabase Knowledge Base is live in public beta at supabase.com/kb. It hosts troubleshooting and migration guides for developers and their agents.

---

## OpenTelemetry traces and metrics in the Supabase .NET SDK

2026-10-14 · New Feature · supabase-dotnet · [supabase.com/changelog/dotnet-opentelemetry-support](https://supabase.com/changelog/dotnet-opentelemetry-support)

The .NET SDK now emits traces and metrics for Auth, Postgrest, Storage, and Functions. Collect them with OpenTelemetry and export to any observability backend.

---

## An outdated subset of TLS 1.2 ciphers will be disabled on project HTTP APIs

2026-10-12 · Breaking Change · Auth, Data APIs, Storage, Realtime, Edge Functions · [supabase.com/changelog/cbc-tls-ciphers-deprecated](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)

Supabase will be disabling a subset of TLS 1.2 ciphers on project HTTP APIs on November 10, 2026. Clients that don't support modern standards (<0.0001% of Supabase traffic) will fail to connect.

---

## ASP.NET Core dependency injection for the Supabase .NET SDK

2026-10-12 · New Feature · supabase-dotnet · [supabase.com/changelog/dotnet-dependency-injection-extension](https://supabase.com/changelog/dotnet-dependency-injection-extension)

The .NET SDK now ships an ASP.NET Core dependency injection package. A single method registers the main client and all sub-clients, so you don't have to wire it up by hand.

---

## The Supabase .NET SDK is now officially supported

2026-10-09 · New Feature · supabase-dotnet · [supabase.com/changelog/supabase-dotnet-official-support](https://supabase.com/changelog/supabase-dotnet-official-support)

The .NET SDK for Supabase is now officially supported. It's the recommended way to build on Supabase from any .NET platform: ASP.NET, Blazor, MAUI, Unity, Azure, and more.

---

## Status page moves to incident.io

2026-10-08 · Improvement · Website · [supabase.com/changelog/status-page-migration](https://supabase.com/changelog/status-page-migration)

status.supabase.com now runs on incident.io. Email subscribers carry over. SMS, Slack, webhook, and RSS subscribers must resubscribe; the new page supports only Email, RSS, and Slack.

---

## Scoped personal access tokens are now generally available

2026-10-06 · New Feature · Platform, Security, CLI, AI · [supabase.com/changelog/scoped-personal-access-tokens-ga](https://supabase.com/changelog/scoped-personal-access-tokens-ga)

Scoped personal access tokens are now available to everyone. Limit a token to specific projects or organizations and grant only the permissions it needs on the Management API, MCP server, and CLI.

---

## Organization invites support the No access role

2026-10-05 · Improvement · Platform, Studio, Security · [supabase.com/changelog/no-access-org-role](https://supabase.com/changelog/no-access-org-role)

Organization invites on Team and Enterprise plans now support the No access role, so admins can default new members to zero project access instead of Read-only access to every project.

---

## [Public Alpha] Supabase Go SDK

2026-10-05 · New Feature · supabase-go · [supabase.com/changelog/supabase-go-public-alpha](https://supabase.com/changelog/supabase-go-public-alpha)

The official Supabase Go SDK v0.1.0-alpha.1 is in public alpha. Its initial feature set lets your backend verify end-user access tokens and query your database as that user under Row Level Security.

---

## Framework adapters in @supabase/server are deprecated

2026-10-05 · Deprecation · supabase-server · [supabase.com/changelog/supabase-server-adapters-deprecated](https://supabase.com/changelog/supabase-server-adapters-deprecated)

The Hono, H3, Elysia, and NestJS adapters in @supabase/server are deprecated and will be removed on December 1, 2026. Move to the framework bridges in the frameworks guide.

---

## [Private Alpha] Multigres: operating system for Postgres

2026-10-01 · New Feature · Database, Multigres · [supabase.com/changelog/multigres-private-alpha](https://supabase.com/changelog/multigres-private-alpha)

Run Supabase with multi-AZ high availability (HA), automatic failover, and scalable connection pooling. Multigres is now in Private Alpha for selected Pro, Team, and Enterprise organizations.

---

## OrioleDB is now in Public Beta with paid plans and paid features

2026-10-01 · Policy · Database, Studio, CLI, Auth, Storage, Realtime, Edge Functions · [supabase.com/changelog/orioledb-public-beta](https://supabase.com/changelog/orioledb-public-beta)

OrioleDB is now in Public Beta. Create OrioleDB projects on Free, Pro, Team, and Enterprise plans, with paid features and standard Postgres pricing. Existing alpha projects don't change.

---

## Supabase Middleware 1.0

2026-09-30 · New Feature · Edge Functions, supabase-js, supabase-middleware, supabase-server · [supabase.com/changelog/supabase-middleware-1-0](https://supabase.com/changelog/supabase-middleware-1-0)

@supabase/middleware 1.0.0 is stable: typed, composable middleware for fetch handlers. The engine runs wherever fetch runs, standalone or inside a framework through a short bridge you copy.

---

## PostgreSQL 15.19 / 17.11 minor release — action may be required for ltree, pgcrypto, btree_gist, and custom operators

2026-09-25 · Breaking Change · Database · [supabase.com/changelog/postgres-15-19-17-11-breaking-changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)

Postgres minor upgrade to 15.19/17.11 fixes 44 CVEs.
ltree and btree_gist indexes may need reindexing, and pgcrypto data encrypted with legacy ciphers needs re-encryption.

---

## Logs usage-based pricing

2026-09-25 · New Feature · Observability · [supabase.com/changelog/logs-usage-based-pricing](https://supabase.com/changelog/logs-usage-based-pricing)

Supabase Logs is moving to usage-based pricing. We're announcing early so you have time to adjust — 90%+ of projects are within the included limits, with a grace period through early 2027.

---

## Database Replication is now Pipelines

2026-09-21 · Improvement · Studio · [supabase.com/changelog/database-replication-renamed-pipelines](https://supabase.com/changelog/database-replication-renamed-pipelines)

Database > Replication is now Database > Pipelines. Existing Replication URLs redirect to the new location. No API or pipeline behavior has changed.

---

## Health Check Advisors

2026-09-18 · Improvement · Auth, Data APIs, Database, Edge Functions, Realtime, Storage · [supabase.com/changelog/50577-health-check-advisors](https://supabase.com/changelog/50577-health-check-advisors)

Supabase Advisors now include service health checks: error rates across Auth, Storage, Edge Functions, and Data APIs, each with a severity level and a direct link to investigate.

---

## Observability on Auto-Pilot

2026-09-13 · New Feature · AI, Observability · [supabase.com/changelog/50403-observability-autopilot](https://supabase.com/changelog/50403-observability-autopilot)

Hire an agent to watch your Supabase project. Prepared prompts for four monitoring roles, ready to run in Claude Routines, Codex, Cursor Automations, or any environment you choose.

---

## Read replicas moved to Project Settings → Infrastructure

2026-08-21 · Improvement · Studio · [supabase.com/changelog/read-replicas-moved-to-infrastructure](https://supabase.com/changelog/read-replicas-moved-to-infrastructure)

Read replicas now live under Project Settings → Infrastructure. Database → Replication is for Pipelines destinations only. No API changes.

---

## Fixed daily backups occasionally skipped due to a scheduling timeout

2026-08-12 · Bug Fix · Database, Platform · [supabase.com/changelog/bulk-prepare-retry-on-transient-failure](https://supabase.com/changelog/bulk-prepare-retry-on-transient-failure)

A timing issue could cause daily backups to be silently skipped for every project due in a 10-minute scheduling window. Backup scheduling now retries and recovers automatically.

---

## Fixed stale database credentials left behind after a restore

2026-07-30 · Bug Fix · Database, Platform · [supabase.com/changelog/restore-credential-resync](https://supabase.com/changelog/restore-credential-resync)

A physical restore could leave a project with stale database credentials, causing authentication failures. Restores now reapply current credentials afterward.

---

## Fixed a panic in project metrics collection that could drop metrics

2026-07-29 · Bug Fix · Observability, Platform · [supabase.com/changelog/admin-api-metrics-panic-fix](https://supabase.com/changelog/admin-api-metrics-panic-fix)

A metrics endpoint could panic under concurrent requests, intermittently stopping metrics from being collected and pushed for a project.

---

## Migration of Supabase Management API `logs.all` analytics endpoint to `logs` endpoint

2026-07-23 · Breaking Change · Platform · [supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint)

The Supabase Management API `logs.all` endpoint is removed on 2026-09-23. Scripts calling it must migrate to the new ClickHouse-backed `logs` endpoint, which accepts ClickHouse SQL only.

---

## Extension version pinning is deprecated in favor of default versions

2026-07-22 · Breaking Change · Database, Security · [supabase.com/changelog/extension-version-pinning-ignored](https://supabase.com/changelog/extension-version-pinning-ignored)

Specifying an explicit version in CREATE or ALTER EXTENSION is deprecated. From 2026-08-05 the version clause is ignored and the extension's default version is installed, with a warning.

---

## [Public Alpha] Supabase Pipelines

2026-07-21 · New Feature · ETL · [supabase.com/changelog/pipelines](https://supabase.com/changelog/pipelines)

Stream Postgres changes to BigQuery in near real time with Supabase Pipelines, a managed CDC service configured right in the Dashboard. Now in public alpha on all paid plans.

---

## Self-hosted Supabase: Envoy becomes the default API gateway (breaking change)

2026-07-17 · Breaking Change · Platform · [supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b)

Self-hosted Supabase makes Envoy the default API gateway, replacing Kong, the week of 2026-08-09. Opt back into Kong if you rely on its HTTPS listener, a custom `kong.yml`, or the kong service name.

---

## Realtime schema is now fully locked down against modifications

2026-07-14 · Breaking Change · Realtime · [supabase.com/changelog/realtime-schema-locked-down-against-modification](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)

Supabase now blocks all changes to the `realtime` schema: creating, altering, or dropping objects fails with a permission error. RLS policies on `realtime.messages` still work.

---

## Deprecation notice: `@supabase/supabase-js` will require TypeScript 5.0+

2026-07-10 · Deprecation · supabase-js · [supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0](https://supabase.com/changelog/47812-deprecation-notice-supabase-supabase-js-will-require-typescript-5-0)

`@supabase/supabase-js` will require TypeScript 5.0 starting January 31, 2027, dropping support for TypeScript 4.7 to 4.9. Upgrade to 5.0 or later before then.

---

## Developer Update - July 2026

2026-07-09 · Improvement · Data APIs, Database, Realtime · [supabase.com/changelog/47796-developer-update-july-2026](https://supabase.com/changelog/47796-developer-update-july-2026)

Supabase Developer Update for July 2026: Realtime Broadcast now supports binary payloads, Wrappers v0.6.2 adds a MongoDB foreign data wrapper, and OpenCode integrates with Supabase.

---

## log_connections is to be turned off by default for new projects and existing Free/Pro projects

2026-06-22 · Improvement · Platform · [supabase.com/changelog/47197-log-connections-is-to-be-turned-off-by-default-for-new-projects-and-existing-free-pro-projects](https://supabase.com/changelog/47197-log-connections-is-to-be-turned-off-by-default-for-new-projects-and-existing-free-pro-projects)

Postgres `log_connections` defaults to off for new projects and existing Free and Pro projects from 2026-07-09, cutting log noise. Re-enable it via the dashboard or Management API.

---

## Self-hosted Supabase: API_EXTERNAL_URL to include /auth/v1

2026-06-18 · Breaking Change · Auth · [supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1)

Self-hosted Supabase's default `API_EXTERNAL_URL` now includes `/auth/v1` from the week of 2026-07-06. SAML SSO users must repoint their IdP to the new `/auth/v1/sso/saml/*` endpoints.

---

## Realtime Broadcast now supports binary payloads

2026-06-11 · New Feature · Realtime · [supabase.com/changelog/46834-realtime-broadcast-now-supports-binary-payloads](https://supabase.com/changelog/46834-realtime-broadcast-now-supports-binary-payloads)

Supabase Realtime Broadcast now sends and receives binary payloads (bytea) over WebSockets, the REST API, and the database, cutting JSON overhead for sensor streams and image frames.

---

## Developer Update - June 2026

2026-06-06 · Improvement · Auth, CLI, Database · [supabase.com/changelog/46689-developer-update-june-2026](https://supabase.com/changelog/46689-developer-update-june-2026)

Supabase's June developer update: $500M Series F led by GIC, Auth passkeys in beta, the Supabase ChatGPT app, the Supabase plugin for AI coding agents, and Multigres 0.1 alpha released.

---

## Changes to Email Template Customisation on Free Tier

2026-06-03 · Breaking Change · Platform · [supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)

From 2026-06-03, new Free plan projects using Supabase's default SMTP cannot customize auth email templates. Existing projects keep theirs. Configure a custom SMTP provider to customize.

---

## Passkeys for Supabase Auth (Beta)

2026-05-28 · New Feature · Platform · [supabase.com/changelog/46458-passkeys-for-supabase-auth-beta](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta)

Supabase Auth now supports passkeys (Beta): passwordless, phishing-resistant sign-in built on WebAuthn using biometrics, a device PIN, or a hardware security key. No action required.

---

## Breaking change in pg_graphql 1.6.0 — GraphQL introspection disabled by default

2026-05-25 · Breaking Change · Database · [supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default](https://supabase.com/changelog/46320-breaking-change-in-pg-graphql-1-6-0-graphql-introspection-disabled-by-default)

pg_graphql 1.6.0 disables GraphQL introspection by default for new projects created on or after 2026-06-29. Re-enable it by adding a comment on the schema.

---

## Feature Preview: Temporary token-based database access

2026-05-25 · New Feature · Database · [supabase.com/changelog/46346-feature-preview-temporary-token-based-database-access](https://supabase.com/changelog/46346-feature-preview-temporary-token-based-database-access)

Supabase project owners and admins can grant temporary database access via Personal Access Tokens (Feature Preview), scoped by role with expiry up to 90 days. No password disclosure.

---

## Self-hosted Supabase: making Analytics and Vector opt-in

2026-05-18 · Breaking Change · Observability · [supabase.com/changelog/46084-self-hosted-supabase-making-analytics-and-vector-opt-in](https://supabase.com/changelog/46084-self-hosted-supabase-making-analytics-and-vector-opt-in)

Self-hosted Supabase makes `analytics` and `vector` opt-in on 2026-06-03. Logs Explorer users must include `docker-compose.logs.yml` in their `docker compose` invocation.

---

## Self-hosted Supabase: switching Studio from supabase_admin to postgres (breaking change)

2026-05-18 · Breaking Change · Database · [supabase.com/changelog/46081-self-hosted-supabase-switching-studio-from-supabase-admin-to-postgres-breaking-change](https://supabase.com/changelog/46081-self-hosted-supabase-switching-studio-from-supabase-admin-to-postgres-breaking-change)

Self-hosted Supabase switches Studio and postgres-meta from `supabase_admin` to `postgres` on 2026-06-17. Existing instances must run `utils/reassign-owner.sh` to migrate ownership in `public`.

---

## Self-hosted Supabase: upgrading from PG 15 to 17 (breaking change)

2026-05-18 · Breaking Change · Database · [supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)

Self-hosted Supabase's default db image moves from Postgres 15 to Postgres 17 on 2026-06-17. PG 15 data does not auto-upgrade; run the upgrade script, or pin `supabase/postgres:15.x` to stay.

---

## Deprecation Notice: Support for Postgres 14 ending on 1st July 2026

2026-05-12 · Deprecation · Platform · [supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)

Supabase support for Postgres 14 ends on 2026-07-01. Projects still on Postgres 14 will be upgraded automatically; projects using removed extensions (timescaledb, plv8, pgjwt) will be paused.

---

## Deprecation Notice: Dropping Support for Node.js 20

2026-05-08 · Deprecation · supabase-js · [supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20)

Supabase client libraries (supabase-js, auth-js, realtime-js, functions-js, storage-js, postgrest-js) drop Node.js 20 support on 2026-06-30. Upgrade to Node.js 22 or later before that date.

---

## Developer Update - May 2026

2026-05-07 · Improvement · Auth, Data APIs, Database, Dev Workflows, Edge Functions, Security, Studio · [supabase.com/changelog/45702-developer-update-may-2026](https://supabase.com/changelog/45702-developer-update-may-2026)

Supabase's May developer update: custom OAuth/OIDC providers for Auth, ISO 27001 certification, @supabase/server SDK, branching without Git by default, plus Data API auto-exposure changes.

---

## Breaking Change: OAuth token endpoint will return HTTP 200 instead of 201

2026-05-01 · Breaking Change · Platform · [supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201](https://supabase.com/changelog/45468-breaking-change-oauth-token-endpoint-will-return-http-200-instead-of-201)

Supabase's OAuth token endpoint `/v1/oauth/token` returns HTTP 200 instead of 201 starting 1 June 2026. Check for any 2XX status (`response.ok`), not a hardcoded 201.

---

## Breaking Change: Tables not exposed to Data and GraphQL API automatically

2026-04-28 · Breaking Change · Data APIs, Database · [supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

New tables in the public schema will no longer be exposed to the Supabase Data API by default. Opt-in today, default for new projects on 2026-05-30, enforced on all projects on 2026-10-30.

---

## Feature Preview: RLS Tester

2026-04-24 · New Feature · Studio · [supabase.com/changelog/45233-feature-preview-rls-tester](https://supabase.com/changelog/45233-feature-preview-rls-tester)

The Supabase Dashboard adds an RLS Tester (Feature Preview): run SELECT queries as any role, see which RLS policies fire, and debug policies. Enable it from your profile menu.

---

## Automatic PostgREST retries for transient errors

2026-04-20 · Improvement · supabase-flutter, supabase-js, supabase-py, supabase-swift · [supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors)

Supabase client libraries (supabase-js, swift, flutter, py) now automatically retry GET and HEAD requests to PostgREST on transient 520, 503, and network errors. Enabled by default, opt-out per call.

---

## Upcoming: Tax Collection on Supabase Invoices

2026-04-17 · Policy · Platform · [supabase.com/changelog/44968-upcoming-tax-collection-on-supabase-invoices](https://supabase.com/changelog/44968-upcoming-tax-collection-on-supabase-invoices)

Supabase will add applicable taxes (VAT, GST, sales tax) to invoices based on each organization's billing address, rolling out from 1 May to 30 June 2026. Review your billing address and Tax ID.

---

## [Public Alpha] Declarative Schema Management with pg-delta

2026-04-16 · New Feature · CLI · [supabase.com/changelog/44938-public-alpha-declarative-schema-management-with-pg-delta](https://supabase.com/changelog/44938-public-alpha-declarative-schema-management-with-pg-delta)

The Supabase CLI now ships pg-delta (Public Alpha): a Postgres 15+ schema diffing engine and declarative SQL workflow. Edit `.sql` files, run `supabase db schema declarative sync`.

---

## Developer Update - April 2026

2026-04-09 · Improvement · Database, Dev Workflows, Studio · [supabase.com/changelog/44713-developer-update-april-2026](https://supabase.com/changelog/44713-developer-update-april-2026)

Supabase's April developer update: GitHub integration on all plans, Multigres Operator open-sourced, Supabase joins the Stripe Projects developer preview, and Supabase docs available over SSH.

---

## Edge Functions rate limits on recursive/nested Edge Functions calls

2026-03-11 · Policy · Edge Functions · [supabase.com/changelog/43644-edge-functions-rate-limits-on-recursive-nested-edge-functions-calls](https://supabase.com/changelog/43644-edge-functions-rate-limits-on-recursive-nested-edge-functions-calls)

Supabase Edge Functions now rate-limit recursive and nested function-to-function calls at a minimum of 5,000 requests per minute per chain. Inbound and external requests are unaffected.

---

## Developer Update - March 2026

2026-03-05 · Improvement · Database, Edge Functions, Observability, Storage · [supabase.com/changelog/43465-developer-update-march-2026](https://supabase.com/changelog/43465-developer-update-march-2026)

Supabase's March developer update: Log Drains on Pro, Storage performance and security overhaul, docs export as Markdown for AI tools, and Edge Functions dashboard for self-hosted and CLI.

---

## Breaking Change: Removing access to OpenAPI spec via the anon key

2026-02-17 · Breaking Change · Data APIs · [supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)

The Supabase Data API stops returning the OpenAPI spec to anon-key requests on 11 March 2026 for new projects and 8 April 2026 for all projects. Use a service role or secret API key instead.

---

## Developer Update - February 2026

2026-02-05 · Improvement · AI, Edge Functions, Security · [supabase.com/changelog/42531-developer-update-february-2026](https://supabase.com/changelog/42531-developer-update-february-2026)

Supabase's February developer update: PrivateLink GA, Supabase as an official Claude connector, Postgres best practices for AI agents, and a heads-up that pg_graphql is becoming opt-in.

---

## Queue table Inserts, edits and deletes on the table editor

2026-02-04 · Improvement · Studio · [supabase.com/changelog/42460-queue-table-inserts-edits-and-deletes-on-the-table-editor](https://supabase.com/changelog/42460-queue-table-inserts-edits-and-deletes-on-the-table-editor)

The Supabase Table Editor now batches inserts, edits, and deletes into a single transaction with a diff preview. Enable it under Feature Previews > Queue table operations.

---

## Breaking Change: pg_graphql no longer enabled automatically (within approx 3 weeks from today)

2026-01-26 · Breaking Change · Platform · [supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks-from-today](https://supabase.com/changelog/42180-breaking-change-pg-graphql-no-longer-enabled-automatically-within-approx-3-weeks-from-today)

pg_graphql will be disabled by default on new Supabase projects, and on existing projects older than 30 days with zero GraphQL traffic. Re-enable it via Database Extensions if needed.

---

## SQL snippets can now be saved in local Studio

2026-01-21 · Improvement · CLI · [supabase.com/changelog/42031-sql-snippets-can-now-be-saved-in-local-studio](https://supabase.com/changelog/42031-sql-snippets-can-now-be-saved-in-local-studio)

Saving SQL snippets now works in local Studio via the CLI. Snippets are stored in `supabase/snippets`, ready to commit alongside your code. Requires CLI v2.72.7 or later.

---

## Developer Update - January 2026

2026-01-08 · Improvement · AI, Security, Studio, supabase-py · [supabase.com/changelog/41796-developer-update-january-2026](https://supabase.com/changelog/41796-developer-update-january-2026)

Supabase's January developer update: Stripe Sync Engine integration in the Dashboard, Index Advisor in the Table Editor, PostgREST v14 on the Data API, and the 2026 security roadmap.

---

## Data API upgrade to PostgREST v14

2025-12-11 · Improvement · Data APIs · [supabase.com/changelog/41288-data-api-upgrade-to-postgrest-v14](https://supabase.com/changelog/41288-data-api-upgrade-to-postgrest-v14)

The Data API is upgrading to PostgREST v14 worldwide, starting in `ap-northeast-1`. GET throughput rises ~20% via a JWT cache, and schema cache loading is faster. No breaking changes.

---

## Developer Update - December 2025

2025-12-10 · Improvement · AI, Auth, ETL, Edge Functions, Observability, Platform · [supabase.com/changelog/41231-developer-update-december-2025](https://supabase.com/changelog/41231-developer-update-december-2025)

Developer Update for December 2025: Supabase ETL, Analytics and Vector Buckets, iceberg-js, Supabase Platform, OAuth 2.1 provider, Kiro integration, and AWS Marketplace listing.

---

## [Public Alpha] Manage Vector Buckets from the dashboard

2025-11-26 · New Feature · AI · [supabase.com/changelog/40815-public-alpha-manage-vector-buckets-from-the-dashboard](https://supabase.com/changelog/40815-public-alpha-manage-vector-buckets-from-the-dashboard)

Supabase Vector Buckets (Public Alpha) can now be managed from the dashboard. Store, index, and query vector embeddings at scale alongside your project's other storage.

---

## Dashboard Updates (101125 - 251125)

2025-11-24 · Improvement · Studio · [supabase.com/changelog/40734-dashboard-updates-101125-251125](https://supabase.com/changelog/40734-dashboard-updates-101125-251125)

Dashboard updates for 10 Nov to 25 Nov 2025: refreshed Storage UI ahead of Analytics and Vector buckets, and per-template toggles for the new security-sensitive Auth emails.

---

## Notify users about security-sensitive actions on their accounts

2025-11-11 · New Feature · Auth, Security · [supabase.com/changelog/40349-notify-users-about-security-sensitive-actions-on-their-accounts](https://supabase.com/changelog/40349-notify-users-about-security-sensitive-actions-on-their-accounts)

Supabase Auth adds email templates for security-sensitive account changes: password, email, phone, identity link or unlink, and MFA enrollment. Enable via Feature previews.

---

## [Public Alpha] Manage Analytics Buckets from the dashboard

2025-11-04 · New Feature · Observability, Storage, Studio · [supabase.com/changelog/40116-public-alpha-manage-analytics-buckets-from-the-dashboard](https://supabase.com/changelog/40116-public-alpha-manage-analytics-buckets-from-the-dashboard)

Supabase Analytics Buckets (Public Alpha) can now be managed from the dashboard. Store large datasets for analytics and reporting alongside your project's other storage.

---

## Dashboard Updates (201025 - 031125)

2025-11-03 · Improvement · Studio · [supabase.com/changelog/40083-dashboard-updates-201025-031125](https://supabase.com/changelog/40083-dashboard-updates-201025-031125)

Dashboard updates for 20 Oct to 3 Nov 2025: refreshed Storage UI ahead of new bucket types, split Auth Reports, Sentry Log Drains support, and three new Realtime configuration settings.

---

## Enhanced Type Inference for Embedded Functions (Computed Relationships)

2025-10-22 · Improvement · supabase-js · [supabase.com/changelog/39773-enhanced-type-inference-for-embedded-functions-computed-relationships](https://supabase.com/changelog/39773-enhanced-type-inference-for-embedded-functions-computed-relationships)

supabase-js 2.75.1 and CLI 2.53.1+ infer `SETOF` functions as embedded relationships in `.select()` queries and raise compile-time errors for invalid rpc calls. Regenerate types to adopt.

---

## Dashboard Updates (061025 - 201025)

2025-10-21 · Improvement · Studio · [supabase.com/changelog/39709-dashboard-updates-061025-201025](https://supabase.com/changelog/39709-dashboard-updates-061025-201025)

Dashboard updates for 6 Oct to 20 Oct 2025: a faster Auth Users page with URL-persisted search, model switching for the Assistant, and a max events per second setting for Realtime.

---

## Supabase Remote MCP server

2025-10-10 · New Feature · AI · [supabase.com/changelog/39434-supabase-remote-mcp-server](https://supabase.com/changelog/39434-supabase-remote-mcp-server)

The Supabase MCP server is now hosted at `https://mcp.supabase.com/mcp`. Connect via browser-based OAuth 2 from clients like ChatGPT, no `npx` or personal access token required.

---

## Potential breaking change in pgmq from 1.4.4 to 1.5.1 and temporary halt on upgrade for existing projects

2025-10-08 · Breaking Change · Database · [supabase.com/changelog/39378-potential-breaking-change-in-pgmq-from-1-4-4-to-1-5-1-and-temporary-halt-on-upgrade-for-existing-projects](https://supabase.com/changelog/39378-potential-breaking-change-in-pgmq-from-1-4-4-to-1-5-1-and-temporary-halt-on-upgrade-for-existing-projects)

New projects on Postgres 17.6.1.016 and later ship pgmq 1.5.1, which changes `delay` parameter behavior. Upgrades for existing projects are paused until an upstream fix lands.

---

## Dashboard Updates (220925 - 061025)

2025-10-06 · Improvement · Studio · [supabase.com/changelog/39292-dashboard-updates-220925-061025](https://supabase.com/changelog/39292-dashboard-updates-220925-061025)

Dashboard updates for 22 Sep to 6 Oct 2025: Assistant response speed and quality improvements, contextual error handling in the Table Editor, and a wrap on Supabase Select.

---

## Supabase JS Client Libs: Migration to Monorepo

2025-10-02 · Improvement · supabase-js · [supabase.com/changelog/39197-supabase-js-client-libs-migration-to-monorepo](https://supabase.com/changelog/39197-supabase-js-client-libs-migration-to-monorepo)

The Supabase JS client libraries (supabase-js, auth-js, postgrest-js, realtime-js, storage-js, functions-js) now live in a single monorepo. No action required for package users.

---

## Dashboard Updates (080925 - 220925)

2025-09-24 · Improvement · Studio · [supabase.com/changelog/38974-dashboard-updates-080925-220925](https://supabase.com/changelog/38974-dashboard-updates-080925-220925)

Dashboard updates for 8 Sep to 22 Sep 2025: Query Performance Advisor refinements and a new Auth Audit Logs setting to stop writing audit logs to the project database.

---

## Changes to Custom JWT and Signing Keys issue resolution

2025-09-17 · Bug Fix · Data APIs · [supabase.com/changelog/38771-changes-to-custom-jwt-and-signing-keys-issue-resolution](https://supabase.com/changelog/38771-changes-to-custom-jwt-and-signing-keys-issue-resolution)

Data API v13 (PostgREST) tightened JWT validation on 2025-07-24 and broke some custom JWT setups. Re-importing the custom signing key per the updated docs resolves the issue.

---

## Dashboard Updates (180825 - 010925)

2025-09-01 · Improvement · Studio · [supabase.com/changelog/38356-dashboard-updates-180825-010925](https://supabase.com/changelog/38356-dashboard-updates-180825-010925)

Dashboard updates for 18 Aug to 1 Sep 2025: expiration dates for Personal Access Tokens, synced report tooltips, refreshed Auth Policies and Integrations pages, and Assistant refinements.

---

## Personal Access Tokens: Expiration & Usage Tracking

2025-08-27 · New Feature · Security · [supabase.com/changelog/38248-personal-access-tokens-expiration-usage-tracking](https://supabase.com/changelog/38248-personal-access-tokens-expiration-usage-tracking)

Personal Access Tokens now support expiration dates (preset, custom up to one year, or never) and usage tracking updated every 15 minutes to help identify unused tokens.

---

## 3x cheaper egress for cache hits

2025-08-22 · Policy · Platform, Storage · [supabase.com/changelog/38119-3x-cheaper-egress-for-cache-hits](https://supabase.com/changelog/38119-3x-cheaper-egress-for-cache-hits)

Supabase Storage splits egress into cached and origin tiers with separate quotas. Cached egress is now $0.03 per GB, three times cheaper than origin egress, on Free and paid plans.

---

## OAuth 2.1 Server Capabilities for Supabase Auth

2025-08-19 · New Feature · Auth · [supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth)

Supabase Auth gains OAuth 2.1 authorization server capabilities (Public Beta), turning your project into an identity provider for third-party apps and MCP clients.

---

## All regions now run Deno 2.1 compatible release

2025-08-15 · Improvement · Edge Functions · [supabase.com/changelog/37941-all-regions-now-run-deno-2-1-compatible-release](https://supabase.com/changelog/37941-all-regions-now-run-deno-2-1-compatible-release)

Edge Functions now run Deno 2.1 in every region. No action required; fall back to Deno 1.45 via the `forceDenoVersion=1` query parameter if you hit compatibility issues.

---

## Change in `realtime-js` affecting Node.js < 22

2025-08-12 · Breaking Change · Realtime · [supabase.com/changelog/37869-change-in-realtime-js-affecting-node-js-22](https://supabase.com/changelog/37869-change-in-realtime-js-affecting-node-js-22)

realtime-js 2.15.1 and supabase-js 2.55.0 require Node.js < 22 users to install `ws` and pass it as the `realtime.transport` option. Node.js 22+ and browsers need no change.

---

## Deprecation Notice: Dropping support for python's gotrue and supafunc

2025-08-08 · Improvement · supabase-py · [supabase.com/changelog/37798-deprecation-notice-dropping-support-for-python-s-gotrue-and-supafunc](https://supabase.com/changelog/37798-deprecation-notice-dropping-support-for-python-s-gotrue-and-supafunc)

The Python `gotrue` and `supafunc` packages are deprecated in favor of `supabase_auth` and `supabase_functions`. Update imports; `supabase-py 2.18.1` drops the old packages.

---

## Dashboard Navigation Updates: Project Settings

2025-08-04 · Improvement · Studio · [supabase.com/changelog/37655-dashboard-navigation-updates-project-settings](https://supabase.com/changelog/37655-dashboard-navigation-updates-project-settings)

Dashboard service settings (Database, Data API, Auth, Storage, Edge Functions, Log Drains) now live in their own sections. Old URLs redirect; Project Settings keeps shortcuts for now.

---

## supabase v17.4.1.062 was withdrawn

2025-07-23 · Bug Fix · supabase-js · [supabase.com/changelog/37415-supabase-v17-4-1-062-was-withdrawn](https://supabase.com/changelog/37415-supabase-v17-4-1-062-was-withdrawn)

Supabase Postgres image 17.4.1.062 was withdrawn after an issue was found. New projects use an earlier release; existing projects on this version should upgrade once a fix ships.

---

## Coming Soon: Combined View for Logs

2025-07-17 · New Feature · Studio · [supabase.com/changelog/37234-coming-soon-combined-view-for-logs](https://supabase.com/changelog/37234-coming-soon-combined-view-for-logs)

A unified Logs view in the Supabase dashboard is coming soon, combining logs across all services with improved filtering and real-time updates. Sign up for early access.

---

## Deprecation Notice: Dropping Support for Node.js 18

2025-07-16 · Deprecation · supabase-js · [supabase.com/changelog/37217-deprecation-notice-dropping-support-for-node-js-18](https://supabase.com/changelog/37217-deprecation-notice-dropping-support-for-node-js-18)

Supabase JS libraries (supabase-js, auth-js, realtime-js, functions-js, storage-js, postgrest-js) drop Node.js 18 support on 2025-10-31. Upgrade to Node.js 20 or later.

---

## Realtime Settings

2025-07-11 · New Feature · Realtime · [supabase.com/changelog/37041-realtime-settings](https://supabase.com/changelog/37041-realtime-settings)

A Realtime Settings screen in the dashboard lets you configure channel restrictions, database connection pool size, and max concurrent clients per project.

---

## Update to Edge Functions Regional Invocations

2025-07-03 · Improvement · Edge Functions · [supabase.com/changelog/36850-update-to-edge-functions-regional-invocations](https://supabase.com/changelog/36850-update-to-edge-functions-regional-invocations)

Edge Functions now accept a `forceFunctionRegion` query parameter to pin invocations to a specific region, useful when request headers cannot be controlled (CORS, webhooks).

---

## Deno 2.1 Preview - Hosted Environment

2025-07-01 · New Feature · Edge Functions · [supabase.com/changelog/36814-deno-2-1-preview-hosted-environment](https://supabase.com/changelog/36814-deno-2-1-preview-hosted-environment)

Edge Functions now offer a Deno 2.1 preview on the hosted platform. Opt in via the `forceDenoVersion=2` query parameter or `x-deno-version: 2` header to test compatibility.

---

## Forthcoming Postgres 17 Release Notes

2025-05-22 · Improvement · Platform · [supabase.com/changelog/35851-forthcoming-postgres-17-release-notes](https://supabase.com/changelog/35851-forthcoming-postgres-17-release-notes)

The upcoming Supabase Postgres 17 bundle drops `timescaledb`, `plv8`, `plls`, `plcoffee`, and `pgjwt`. Postgres 15 keeps the extensions until end of life around May 2026; drop them before upgrading.

---

## Feature Preview: Tabs for Table and SQL Editor

2025-05-13 · New Feature · Studio · [supabase.com/changelog/35636-feature-preview-tabs-for-table-and-sql-editor](https://supabase.com/changelog/35636-feature-preview-tabs-for-table-and-sql-editor)

Supabase Studio brings back tabs in the Table Editor and SQL Editor, letting you switch between tables across schemas or between snippets without navigating the list. Now fully rolled out.

---

## Developer Update - April 2025

2025-05-07 · Improvement · AI, Security, Studio · [supabase.com/changelog/35523-developer-update-april-2025](https://supabase.com/changelog/35523-developer-update-april-2025)

Supabase developer update for April 2025: project-scoped roles on Team plans, the MCP server works with VS Code and deploys Edge Functions, plus Infinite Query and Social Auth in the UI Library.

---

## Dashboard Updates [210425 - 050525]

2025-05-06 · Improvement · Studio · [supabase.com/changelog/35495-dashboard-updates-210425-050525](https://supabase.com/changelog/35495-dashboard-updates-210425-050525)

Supabase Studio dashboard updates from 21 Apr to 5 May 2025: sort columns from the Table Editor column header, set a billing address and billing name when creating or upgrading an organization.

---

## Dashboard Updates [070425 - 210425]

2025-04-21 · Improvement · Studio · [supabase.com/changelog/35169-dashboard-updates-070425-210425](https://supabase.com/changelog/35169-dashboard-updates-070425-210425)

Supabase Studio dashboard updates from 7 to 21 Apr 2025: revamped organization layout (Feature Preview), redesigned billing breakdown, database upgrade logs, and Feature Previews on self-hosted.

---

## Project scoped roles now available in Team plans

2025-04-21 · New Feature · Security · [supabase.com/changelog/35172-project-scoped-roles-now-available-in-team-plans](https://supabase.com/changelog/35172-project-scoped-roles-now-available-in-team-plans)

Supabase project-scoped roles are now available on Team plans. Restrict an organization member to specific projects with per-project permissions, useful for security boundaries and HIPAA compliance.

---

## Developer Update - March 2025

2025-04-08 · Improvement · AI, Database, Studio · [supabase.com/changelog/34839-developer-update-march-2025](https://supabase.com/changelog/34839-developer-update-march-2025)

Supabase developer update for March 2025 and Launch Week 14: the official Supabase MCP server, the Supabase UI Library on shadcn, Realtime Broadcast from Database, and declarative schemas.

---

## Dashboard Updates [240225 - 070425]

2025-04-07 · Improvement · Studio · [supabase.com/changelog/34794-dashboard-updates-240225-070425](https://supabase.com/changelog/34794-dashboard-updates-240225-070425)

Supabase Studio dashboard updates from 24 Feb to 7 Apr 2025 covering Launch Week 14: create, edit, test, and deploy Edge Functions in the dashboard, plus Table Editor and SQL Editor tabs.

---

## Supabase Management API `GET` Logs Restrictions

2025-04-01 · Breaking Change · Platform · [supabase.com/changelog/34634-supabase-management-api-get-logs-restrictions](https://supabase.com/changelog/34634-supabase-management-api-get-logs-restrictions)

On 2025-04-02 the Supabase Management API `GET /projects/{ref}/analytics/endpoints/logs.all` defaults to a one-minute window and caps explicit ranges at 24 hours. Update clients querying wider ranges.

---

## Upcoming Change: Improved Experimental Routing for Read Replica Load Balancers

2025-03-27 · Improvement · Platform · [supabase.com/changelog/34494-upcoming-change-improved-experimental-routing-for-read-replica-load-balancers](https://supabase.com/changelog/34494-upcoming-change-improved-experimental-routing-for-read-replica-load-balancers)

On 2025-04-04 the Supabase Data API switches experimental routing for GET requests from round-robin across all replicas to geo-routing that targets the nearest available database, lowering latency.

---

## Dedicated Pooler with PgBouncer

2025-03-25 · New Feature · Platform · [supabase.com/changelog/34404-dedicated-pooler-with-pgbouncer](https://supabase.com/changelog/34404-dedicated-pooler-with-pgbouncer)

Supabase Dedicated Pooler is now generally available on Pro and above: a co-located PgBouncer instance with lower latency than the Shared Pooler for serverless workloads. Transaction mode, IPv6 only.

---

## Restricting Access on Auth, Storage, and Realtime Schemas on April 21, 2025

2025-03-18 · Breaking Change · Auth, Realtime, Storage · [supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025)

On 2025-04-21 Supabase restricts SQL on the `auth`, `storage`, and `realtime` schemas: no creating or dropping tables or functions, no writes to migration tables. Move custom objects elsewhere.

---

## Deno 2.1 Preview **local only**

2025-03-07 · New Feature · Edge Functions · [supabase.com/changelog/34054-deno-2-1-preview-local-only](https://supabase.com/changelog/34054-deno-2-1-preview-local-only)

Supabase Edge Functions now run on Deno 2.1 locally via the Supabase CLI. Set `deno_version = 2` in `config.toml` to try it before the hosted runtime upgrade. Report regressions during the preview.

---

## Developer Update - February 2025

2025-03-07 · Improvement · AI, Database, Edge Functions, Platform, Studio · [supabase.com/changelog/34067-developer-update-february-2025](https://supabase.com/changelog/34067-developer-update-february-2025)

Supabase developer update for February 2025: deploy Edge Functions from the dashboard, CLI, or Management API; new Model Context Protocol docs; and cheaper third-party Auth quotas.

---

## Greatly increased Third-Party Auth MAU quota for Free and Paid Plans

2025-03-03 · Policy · Platform · [supabase.com/changelog/33959-greatly-increased-third-party-auth-mau-quota-for-free-and-paid-plans](https://supabase.com/changelog/33959-greatly-increased-third-party-auth-mau-quota-for-free-and-paid-plans)

Supabase third-party Auth quotas now match standard Auth: 50,000 MAU on the Free Plan and 100,000 MAU on Pro and Team. Overage stays at $0.00325 per MAU. Effective immediately, no action required.

---

## Dashboard Updates [10/02/25 - 24/02/25]

2025-02-25 · Improvement · Studio · [supabase.com/changelog/33835-dashboard-updates-10-02-25-24-02-25](https://supabase.com/changelog/33835-dashboard-updates-10-02-25-24-02-25)

Supabase Studio dashboard updates from 10 to 24 Feb 2025: the new Inline Editor (Feature Preview) for running SQL anywhere, plus Auth, Billing, Edge Functions, and Logs improvements.

---

## Deploy and update Edge Functions using the Management API

2025-02-20 · New Feature · Edge Functions · [supabase.com/changelog/33720-deploy-and-update-edge-functions-using-the-management-api](https://supabase.com/changelog/33720-deploy-and-update-edge-functions-using-the-management-api)

The Supabase Management API now exposes endpoints to deploy a single Edge Function and to bulk-update functions atomically, useful for integrations and CI flows that do not depend on the Supabase CLI.

---

## Feature Preview: Inline Editor

2025-02-19 · New Feature · Studio · [supabase.com/changelog/33690-feature-preview-inline-editor](https://supabase.com/changelog/33690-feature-preview-inline-editor)

Supabase Studio Inline Editor (Feature Preview) opens a SQL editor anywhere in the dashboard, with an inline AI assistant (cmd+k) and a SQL-first flow for creating policies, triggers, and functions.

---

## Upcoming breaking change to Dashboard Navigation

2025-02-18 · Breaking Change · Studio · [supabase.com/changelog/33670-upcoming-breaking-change-to-dashboard-navigation](https://supabase.com/changelog/33670-upcoming-breaking-change-to-dashboard-navigation)

Supabase Dashboard navigation now centers on a single active organization, with separate sidebars for Projects and Organizations, an Organization picker in the header, and a new `/organizations` page.

---

## Deploy Edge Functions from CLI without needing Docker + import files outside of supabase directory

2025-02-14 · New Feature · CLI, Edge Functions · [supabase.com/changelog/33613-deploy-edge-functions-from-cli-without-needing-docker-import-files-outside-of-supabase-directory](https://supabase.com/changelog/33613-deploy-edge-functions-from-cli-without-needing-docker-import-files-outside-of-supabase-directory)

Supabase CLI 2.13.3 beta adds `supabase functions deploy --use-api` to deploy Edge Functions without Docker and to import files outside the `supabase/` directory, ideal for monorepos and CI.

---

## Dashboard Updates [27/01/25 - 10/02/25]

2025-02-11 · Improvement · Studio · [supabase.com/changelog/33511-dashboard-updates-27-01-25-10-02-25](https://supabase.com/changelog/33511-dashboard-updates-27-01-25-10-02-25)

Supabase Studio dashboard updates from 27 Jan to 10 Feb 2025: deploy Edge Functions via the AI Assistant, Auth settings consolidated, reference rows in popovers, Security Definer view fix.

---

## Deprecation of Fly.io Postgres Managed by Supabase on April 11, 2025

2025-02-07 · Deprecation · Platform · [supabase.com/changelog/33413-deprecation-of-fly-io-postgres-managed-by-supabase-on-april-11-2025](https://supabase.com/changelog/33413-deprecation-of-fly-io-postgres-managed-by-supabase-on-april-11-2025)

Supabase is deprecating Fly.io Postgres managed by Supabase on 2025-04-11. Signups are disabled; existing projects are removed on that date. Migrate to Supabase Postgres or Fly native Postgres.

---

## Developer Update - January 2025

2025-02-07 · Improvement · AI, Auth, Observability, Studio · [supabase.com/changelog/33416-developer-update-january-2025](https://supabase.com/changelog/33416-developer-update-january-2025)

Supabase developer update for January 2025: third-party Auth with Firebase reaches GA, stacked log charts highlight errors, supabase-js gains JSON type inference and stricter filter type validation.

---

## Dashboard Updates [13/01/25 - 27/01/25]

2025-01-28 · Improvement · Studio · [supabase.com/changelog/33144-dashboard-updates-13-01-25-27-01-25](https://supabase.com/changelog/33144-dashboard-updates-13-01-25-27-01-25)

Supabase Studio dashboard updates from 13 to 27 Jan 2025: stacked log charts surface errors and warnings, three new disk autoscale parameters, and a flat SQL Editor search list with snippets surfaced.

---

## Relaxing Database Size limit on Free Plan - 0.5 GB Database Size per project

2025-01-27 · Policy · Platform · [supabase.com/changelog/33121-relaxing-database-size-limit-on-free-plan-0-5-gb-database-size-per-project](https://supabase.com/changelog/33121-relaxing-database-size-limit-on-free-plan-0-5-gb-database-size-per-project)

The Supabase Free Plan 0.5 GB database size limit now applies per active project rather than per organization. Paused and deleted projects no longer count toward the cap. Effective immediately.

---

## Developer Update - December 2024

2025-01-23 · Improvement · AI, Security, Studio · [supabase.com/changelog/33035-developer-update-december-2024](https://supabase.com/changelog/33035-developer-update-december-2024)

Supabase developer update for December 2024: new Integrations page, AI Assistant fixes for Security and Performance advisors, inline AI in the SQL Editor, and Vercel Branching support.

---

## Enhanced Type Inference for JSON Fields in supabase-js

2025-01-20 · Improvement · supabase-js · [supabase.com/changelog/32925-enhanced-type-inference-for-json-fields-in-supabase-js](https://supabase.com/changelog/32925-enhanced-type-inference-for-json-fields-in-supabase-js)

supabase-js 2.48.0 infers types for JSON fields when querying with the `->` selector. Define a custom JSON type with `MergeDeep` and the SDK returns the correct shape for nested selections.

---

## Add static files to Edge Functions

2025-01-15 · New Feature · Edge Functions · [supabase.com/changelog/32815-add-static-files-to-edge-functions](https://supabase.com/changelog/32815-add-static-files-to-edge-functions)

Supabase CLI 2.7.0 bundles static files with Edge Functions. Declare files in `config.toml` under `static_files` and read them at runtime via Deno APIs. Supports Wasm modules and HTML templates.

---

## Credit Balance Top Up

2025-01-13 · New Feature · Platform · [supabase.com/changelog/32735-credit-balance-top-up](https://supabase.com/changelog/32735-credit-balance-top-up)

Supabase organizations can now top up their credit balance from billing settings. Topped-up credits never expire, apply to future invoices only, and are not refundable. Available on all paid plans.

---

## Dashboard Updates [30/12/24 - 13/01/25]

2025-01-13 · Improvement · Studio · [supabase.com/changelog/32741-dashboard-updates-30-12-24-13-01-25](https://supabase.com/changelog/32741-dashboard-updates-30-12-24-13-01-25)

Supabase Studio dashboard updates from 30 Dec 2024 to 13 Jan 2025: Log Explorer detail panel UX overhaul, S3 protocol toggle in Storage settings, credit balance top-up, and assorted bug fixes.

---

## Supabase Connection Pooler Deprecating Session Mode on Port 6543 on February 28, 2025

2025-01-13 · Deprecation · Platform · [supabase.com/changelog/32755-supabase-connection-pooler-deprecating-session-mode-on-port-6543-on-february-28-2025](https://supabase.com/changelog/32755-supabase-connection-pooler-deprecating-session-mode-on-port-6543-on-february-28-2025)

Supavisor deprecates Session Mode on port 6543 on 2025-02-28; after that date port 6543 only supports Transaction Mode. Move Session Mode clients to port 5432. Transaction-only users need no action.

---

## Type validation for query filter values in supabase-js

2025-01-09 · Improvement · supabase-js · [supabase.com/changelog/32677-type-validation-for-query-filter-values-in-supabase-js](https://supabase.com/changelog/32677-type-validation-for-query-filter-values-in-supabase-js)

supabase-js 2.47.12 now type-checks values passed to the `eq`, `neq`, and `in` query filters, including enums, across tables, views, and nested relations. LSP autocompletes enum values.

---

## Use a custom NPM registry for Edge Function dependencies

2025-01-07 · New Feature · Edge Functions · [supabase.com/changelog/32635-use-a-custom-npm-registry-for-edge-function-dependencies](https://supabase.com/changelog/32635-use-a-custom-npm-registry-for-edge-function-dependencies)

Supabase Edge Functions can now load NPM modules from a custom private registry, configured with `NPM_CONFIG_REGISTRY` in `.env` or on the deploy command. Requires Supabase CLI 2.2.8 or newer.

---

## Dashboard Updates [09/12/24 - 23/12/24]

2024-12-24 · Improvement · Studio · [supabase.com/changelog/31318-dashboard-updates-09-12-24-23-12-24](https://supabase.com/changelog/31318-dashboard-updates-09-12-24-23-12-24)

Dashboard updates: mobile navigation lands for the dashboard, inline AI Assistant completions in the SQL Editor via CMD/CTRL+K, and bulk delete for up to 20 Auth users at a time.

---

## Dashboard Updates [18/11/24 - 09/12/24]

2024-12-10 · Improvement · Studio · [supabase.com/changelog/31041-dashboard-updates-18-11-24-09-12-24](https://supabase.com/changelog/31041-dashboard-updates-18-11-24-09-12-24)

Dashboard updates from Launch Week 13: a unified Integrations page, the AI Assistant V2 available across the dashboard, Supabase Cron, Supabase Queues, and Restore to a new project.

---

## Slack V1 OAuth Provider Deprecated in favour of Slack (OIDC)

2024-12-02 · Deprecation · Auth · [supabase.com/changelog/30772-slack-v1-oauth-provider-deprecated-in-favour-of-slack-oidc](https://supabase.com/changelog/30772-slack-v1-oauth-provider-deprecated-in-favour-of-slack-oidc)

The Slack v1 OAuth provider in Supabase Auth is deprecated in favour of the new Slack (OIDC) provider. Migrate before 2025-01-15, when the legacy provider is removed from the dashboard.

---

## Removal of app.settings.jwt_secret from the database

2024-11-22 · Breaking Change · Security · [supabase.com/changelog/30606-removal-of-app-settings-jwt-secret-from-the-database](https://supabase.com/changelog/30606-removal-of-app-settings-jwt-secret-from-the-database)

On 2024-11-22, Supabase removes `app.settings.jwt_secret` from the `postgres` database. SQL functions calling `current_setting('app.settings.jwt_secret')` must migrate to Vault.

---

## Dashboard Updates [04/11/24 - 18/11/24]

2024-11-18 · Improvement · Studio · [supabase.com/changelog/30526-dashboard-updates-04-11-24-18-11-24](https://supabase.com/changelog/30526-dashboard-updates-04-11-24-18-11-24)

Dashboard updates: Table Editor performance work cuts perceived load times via query optimizations and prefetching, plus Auth user-sort fixes and Storage image-transform toggles.

---

## `supabase-js` release candidate `2.46.2-rc.3` incoming types inferences for PostgREST fixes and feedbacks

2024-11-06 · Bug Fix · Data APIs, supabase-js · [supabase.com/changelog/30324-supabase-js-release-candidate-2-46-2-rc-3-incoming-types-inferences-for-postgrest-fixes-and-feedbacks](https://supabase.com/changelog/30324-supabase-js-release-candidate-2-46-2-rc-3-incoming-types-inferences-for-postgrest-fixes-and-feedbacks)

`supabase-js` 2.46.2-rc.3 fixes PostgREST type inference: embeddings now correctly infer single vs array results and object embeddings model nullability. May require regenerating database types.

---

## Use `deno.json` configuration file in Edge Functions

2024-11-05 · New Feature · Edge Functions · [supabase.com/changelog/30291-use-deno-json-configuration-file-in-edge-functions](https://supabase.com/changelog/30291-use-deno-json-configuration-file-in-edge-functions)

Supabase Edge Functions now support a per-function `deno.json` or `deno.jsonc` file for managing imports and dependencies. Requires Supabase CLI v1.215.0 or later.

---

## Write Edge Functions in pure JavaScript instead of using TypeScript

2024-11-05 · New Feature · Edge Functions · [supabase.com/changelog/30307-write-edge-functions-in-pure-javascript-instead-of-using-typescript](https://supabase.com/changelog/30307-write-edge-functions-in-pure-javascript-instead-of-using-typescript)

Supabase Edge Functions now accept a custom entrypoint via `config.toml`, so you can author functions in `.js`, `.jsx`, `.tsx`, or `.mjs` instead of TypeScript. Requires Supabase CLI 1.215.0 or later.

---

## Dashboard Updates [21/10/24 - 04/11/24]

2024-11-04 · Improvement · Auth, Studio · [supabase.com/changelog/30264-dashboard-updates-21-10-24-04-11-24](https://supabase.com/changelog/30264-dashboard-updates-21-10-24-04-11-24)

Dashboard updates: Auth email templates now run a SpamAssassin-powered spam check, plus sorting users by last sign-in and a Storage fix for the Developer role.

---

## Import NPM packages from private registries in Edge Functions

2024-10-30 · New Feature · Edge Functions · [supabase.com/changelog/30179-import-npm-packages-from-private-registries-in-edge-functions](https://supabase.com/changelog/30179-import-npm-packages-from-private-registries-in-edge-functions)

Supabase Edge Functions can now import npm packages from private registries via an `.npmrc` file under `supabase/functions`. Requires Supabase CLI v1.207.9 or later.

---

## Dashboard Updates [07/10/24 - 21/10/24]

2024-10-21 · Improvement · Studio · [supabase.com/changelog/30005-dashboard-updates-07-10-24-21-10-24](https://supabase.com/changelog/30005-dashboard-updates-07-10-24-21-10-24)

Dashboard updates: a new organization-level disk size overview for paid plans, plus Table Editor CSV export and SQL Editor fixes for the local dashboard.

---

## Developer Update - September 2024

2024-10-10 · Improvement · Edge Functions, Studio · [supabase.com/changelog/29828-developer-update-september-2024](https://supabase.com/changelog/29828-developer-update-september-2024)

September 2024 developer update: the official Supabase + Vercel integration ships, Edge Functions boot 3x faster and are 2x smaller, and Supabase raises an $80M Series C.

---

## Improved docs information architecture

2024-10-09 · Improvement · Platform · [supabase.com/changelog/29798-improved-docs-information-architecture](https://supabase.com/changelog/29798-improved-docs-information-architecture)

Supabase docs now split into Build and Manage top-level menus, with a new Deployment section and a Monitoring and troubleshooting section to make features and guides easier to find.

---

## Dashboard Updates [23/09/24 - 07/10/24]

2024-10-07 · Improvement · Studio · [supabase.com/changelog/29710-dashboard-updates-23-09-24-07-10-24](https://supabase.com/changelog/29710-dashboard-updates-23-09-24-07-10-24)

Dashboard updates: the Auth users page gets a new data-grid view with detail panels, ban controls, provider filters, and a timestamp helper across Logs collections.

---

## XHTML responses are only allowed with a Custom Domain enabled

2024-10-02 · Breaking Change · Platform · [supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled](https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled)

The Supabase Data API and Edge Functions no longer return XHTML on shared domains. Projects that need XHTML responses must enable the Custom Domain add-on. Affected projects notified.

---

## Supabase Platform Access Control: Project Permissions Breaking Changes on October 15, 2024

2024-09-24 · Breaking Change · Security · [supabase.com/changelog/29494-supabase-platform-access-control-project-permissions-breaking-changes-on-october-15-2024](https://supabase.com/changelog/29494-supabase-platform-access-control-project-permissions-breaking-changes-on-october-15-2024)

On 2024-10-15, Enterprise organizations lose Developer role write access to project API, Auth, Storage, Edge Functions, and Logs configuration. Read-Only role is unchanged.

---

## Dashboard Weekly Updates [16/09/24 - 23/09/24]

2024-09-23 · Improvement · Studio · [supabase.com/changelog/29447-dashboard-weekly-updates-16-09-24-23-09-24](https://supabase.com/changelog/29447-dashboard-weekly-updates-16-09-24-23-09-24)

Dashboard updates: deploy up to five Read Replicas on XL and larger compute sizes, plus a new SQL Editor warning for `UPDATE` queries missing a `WHERE` clause.

---

## Projects on XL and larger compute add-ons can now create up to 5 Read Replicas.

2024-09-22 · Improvement · Platform · [supabase.com/changelog/29434-projects-on-xl-and-larger-compute-add-ons-can-now-create-up-to-5-read-replicas](https://supabase.com/changelog/29434-projects-on-xl-and-larger-compute-add-ons-can-now-create-up-to-5-read-replicas)

Supabase Read Replicas now scale to five per project on XL or larger compute add-ons, up from two. Smaller compute sizes keep the existing two-replica limit.

---

## Supabase Auth: Changes to default email provider

2024-09-18 · Policy · Auth · [supabase.com/changelog/29370-supabase-auth-changes-to-default-email-provider](https://supabase.com/changelog/29370-supabase-auth-changes-to-default-email-provider)

From 2024-09-26, Supabase Auth's default email provider sends only to organization members. Projects relying on default email auth must configure custom SMTP or a Send Email Auth Hook.

---

## Developer Update - August 2024

2024-09-16 · Improvement · AI, Auth, Data APIs, Database, Observability, Realtime, supabase-py · [supabase.com/changelog/29331-developer-update-august-2024](https://supabase.com/changelog/29331-developer-update-august-2024)

August 2024 developer update recaps Launch Week 12: postgres.new in-browser Postgres with an AI interface, Realtime Broadcast and Presence authorization, and Log Drains.

---

## Supabase Auth: Asymmetric Keys support in 2025

2024-09-13 · New Feature · Auth · [supabase.com/changelog/29289-supabase-auth-asymmetric-keys-support-in-2025](https://supabase.com/changelog/29289-supabase-auth-asymmetric-keys-support-in-2025)

Supabase Auth is adding asymmetric JWT signing keys with a public JWKs endpoint and a new `getClaims()` method. Projects created after 2025-05-01 default to RSA asymmetric keys.

---

## Dashboard Weekly Updates [02/09/24 - 09/09/24]

2024-09-12 · Improvement · Studio · [supabase.com/changelog/29239-dashboard-weekly-updates-02-09-24-09-09-24](https://supabase.com/changelog/29239-dashboard-weekly-updates-02-09-24-09-09-24)

Dashboard updates: Schema Visualizer node positions now persist in local storage, plus SQL Editor query-size validation and Table Editor fixes for empty tables and large JSON fields.

---

## Edge Functions are now Deno 1.45 compatible

2024-09-10 · Improvement · Edge Functions · [supabase.com/changelog/29189-edge-functions-are-now-deno-1-45-compatible](https://supabase.com/changelog/29189-edge-functions-are-now-deno-1-45-compatible)

Supabase Edge Runtime 1.57 is now serving Edge Functions and is compatible with Deno 1.45. Local development picks it up via Supabase CLI 1.192.5 or later. No action required.

---

## Dashboard Weekly Updates [26/08/24 - 02/09/24]

2024-09-02 · Improvement · Studio · [supabase.com/changelog/29030-dashboard-weekly-updates-26-08-24-02-09-24](https://supabase.com/changelog/29030-dashboard-weekly-updates-26-08-24-02-09-24)

Dashboard updates: upgrade an organization directly from the pricing page, payment method UX fixes for expired cards, and pick which schemas to share with the Supabase AI Assistant.

---

## Dashboard Weekly Updates [26/08/24 - 30/08/24]

2024-08-30 · Improvement · Studio · [supabase.com/changelog/29004-dashboard-weekly-updates-26-08-24-30-08-24](https://supabase.com/changelog/29004-dashboard-weekly-updates-26-08-24-30-08-24)

Dashboard updates: SQL Editor now organizes Private, Favourites, and Shared snippets into folders, with a compute size badge and a refreshed AI Assistant model.

---

## Moving to hourly usage-based billing for databases, based on disk consumption

2024-08-23 · Policy · Platform · [supabase.com/changelog/28849-moving-to-hourly-usage-based-billing-for-databases-based-on-disk-consumption](https://supabase.com/changelog/28849-moving-to-hourly-usage-based-billing-for-databases-based-on-disk-consumption)

Paid plan database billing moves to hourly proration on provisioned disk on 2024-08-26. First 8 GB per project included, then $0.000171 per GB-hour. Free Plan unaffected.

---

## Threshold for transitioning projects to physical backups lowered to 15GB

2024-08-19 · Improvement · Platform · [supabase.com/changelog/28738-threshold-for-transitioning-projects-to-physical-backups-lowered-to-15gb](https://supabase.com/changelog/28738-threshold-for-transitioning-projects-to-physical-backups-lowered-to-15gb)

Supabase daily backups switch to physical backups for any project larger than 15 GB, down from the previous threshold. Backups taken this way can no longer be downloaded from the dashboard.

---

## Developer Updates - July 2024

2024-08-09 · Improvement · Database, Platform · [supabase.com/changelog/28519-developer-updates-july-2024](https://supabase.com/changelog/28519-developer-updates-july-2024)

July 2024 developer update previews Launch Week 12 and ships Data API hardening (disable, custom schema), hourly Storage billing, and more Edge Functions included on every plan.

---

## Let's Encrypt cross-signed chain will no longer be used for Custom Domains after September 9, 2024

2024-08-09 · Breaking Change · Platform · [supabase.com/changelog/28493-let-s-encrypt-cross-signed-chain-will-no-longer-be-used-for-custom-domains-after-september-9-2024](https://supabase.com/changelog/28493-let-s-encrypt-cross-signed-chain-will-no-longer-be-used-for-custom-domains-after-september-9-2024)

Custom Domain endpoints move from the Let's Encrypt cross-signed chain to the self-signed chain on 2024-09-09. Very old clients such as Android 7.0 and below may lose trust.

---

## Improved invoices and more timely usage data

2024-08-08 · Improvement · Platform · [supabase.com/changelog/28480-improved-invoices-and-more-timely-usage-data](https://supabase.com/changelog/28480-improved-invoices-and-more-timely-usage-data)

Usage data on Supabase invoices and the org usage page now refreshes within one hour instead of 24. Invoices show per-project breakdowns for Compute, Egress, and Realtime Messages.

---

## Moving to hourly usage-based billing for IPv4, Custom Domain and Point-in-time recovery

2024-08-07 · Policy · Platform · [supabase.com/changelog/28438-moving-to-hourly-usage-based-billing-for-ipv4-custom-domain-and-point-in-time-recovery](https://supabase.com/changelog/28438-moving-to-hourly-usage-based-billing-for-ipv4-custom-domain-and-point-in-time-recovery)

IPv4, Custom Domain, and Point-in-time Recovery add-ons move to hourly usage-based billing on 2024-08-26. Monthly prices are unchanged. No more upfront charges or prorated credits.

---

## Moving to hourly billing for Storage Size

2024-08-02 · Policy · Platform · [supabase.com/changelog/28339-moving-to-hourly-billing-for-storage-size](https://supabase.com/changelog/28339-moving-to-hourly-billing-for-storage-size)

Storage Size billing moves to hourly proration on 2024-08-26. Prices and quotas are unchanged. Short-lived projects and Branching users see lower bills. No action required.

---

## Wrappers Wasm FDW is on Public Alpha

2024-07-30 · New Feature · Database · [supabase.com/changelog/28267-wrappers-wasm-fdw-is-on-public-alpha](https://supabase.com/changelog/28267-wrappers-wasm-fdw-is-on-public-alpha)

Wrappers 0.4.1 ships the WebAssembly Foreign Data Wrapper in public alpha, with new Snowflake and Paddle Wasm FDWs and a path for community-built wrappers.

---

## Developer Updates - June 2024

2024-07-24 · Improvement · Edge Functions, Observability, Platform, Studio · [supabase.com/changelog/28154-developer-updates-june-2024](https://supabase.com/changelog/28154-developer-updates-june-2024)

June 2024 developer update: Edge Runtime Inspector for CLI debugging, view and abort running queries in Studio SQL Editor, and log drains via the ELK stack integration.

---

## DigiCert no longer being used as the CA for Supabase HTTP APIs

2024-07-22 · Breaking Change · Security · [supabase.com/changelog/28118-digicert-no-longer-being-used-as-the-ca-for-supabase-http-apis](https://supabase.com/changelog/28118-digicert-no-longer-being-used-as-the-ca-for-supabase-http-apis)

Supabase HTTP APIs no longer use DigiCert as the root CA. Clients that trust only DigiCert must update their trust store to include the Cloudflare CAs Supabase now uses.

---

## Edge Functions: Deploy More Functions at No Extra Cost

2024-07-18 · Policy · Platform · [supabase.com/changelog/28062-edge-functions-deploy-more-functions-at-no-extra-cost](https://supabase.com/changelog/28062-edge-functions-deploy-more-functions-at-no-extra-cost)

Edge Functions usage-based billing is removed. Free Plan includes 25 functions, Pro 500, Team 1000, Enterprise unlimited. No extra charges for paid plans that exceed previous limits.

---

## Dashboard Weekly Updates [08/07/24 - 15/07/24]

2024-07-15 · Improvement · Studio · [supabase.com/changelog/27988-dashboard-weekly-updates-08-07-24-15-07-24](https://supabase.com/changelog/27988-dashboard-weekly-updates-08-07-24-15-07-24)

Dashboard updates: projects can now expose a dedicated `api` schema instead of `public` for the Data API, plus SQL Editor and Logs Explorer fixes.

---

## Supabase Platform Access Control: Organization Permissions Breaking Changes on July 26, 2024

2024-07-15 · Breaking Change · Platform · [supabase.com/changelog/27993-supabase-platform-access-control-organization-permissions-breaking-changes-on-july-26-2024](https://supabase.com/changelog/27993-supabase-platform-access-control-organization-permissions-breaking-changes-on-july-26-2024)

On 2024-07-26, Supabase removes Developer and Read-Only role access to GitHub and Vercel integration management at the organization level. Existing integrations keep working.

---

## Postgres 13 Deprecation Notice

2024-07-12 · Deprecation · Database · [supabase.com/changelog/27946-postgres-13-deprecation-notice](https://supabase.com/changelog/27946-postgres-13-deprecation-notice)

Postgres 13 is deprecated on Supabase. Upgrade affected projects to Postgres 15 before 2024-11-15, when remaining Postgres 13 projects will be auto-upgraded or paused.

---

## Dashboard Weekly Updates [01/07/24 - 08/07/24]

2024-07-09 · Improvement · Studio · [supabase.com/changelog/27876-dashboard-weekly-updates-01-07-24-08-07-24](https://supabase.com/changelog/27876-dashboard-weekly-updates-01-07-24-08-07-24)

Dashboard updates: option to disable the Data API at project creation, Realtime Broadcast and Presence authorization via RLS on `realtime.messages`, and faster Table Editor row counts.

---

## Dashboard Weekly Updates [17/06/24 - 24/06/24]

2024-06-24 · Improvement · Studio · [supabase.com/changelog/27498-dashboard-weekly-updates-17-06-24-24-06-24](https://supabase.com/changelog/27498-dashboard-weekly-updates-17-06-24-24-06-24)

Dashboard weekly roll-up: clearer compute pricing during project creation, a default Table Editor sort to keep updated rows in place, and Query Performance index advisor for PostgREST.

---

## Paused Free Plan projects are restorable for 90 days

2024-06-24 · Policy · Platform · [supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days)

From June 24, 2024, paused Free Plan Supabase projects are restorable for 90 days. Projects paused before that date have until September 22, 2024. Paid plans are unaffected.

---

## Developer Updates - May 2024

2024-06-18 · Improvement · AI, Auth, Edge Functions, Realtime, Studio · [supabase.com/changelog/27338-developer-updates-may-2024](https://supabase.com/changelog/27338-developer-updates-may-2024)

May 2024 Developer Updates from Consolidation Month: the new `@supabase/ssr` package, pgvector v0.7.0 with float16 vectors, Edge Functions memory fixes, and standardized Realtime error codes.

---

## Edge Functions are now Deno 1.43 compatible

2024-06-18 · Improvement · Edge Functions · [supabase.com/changelog/27349-edge-functions-are-now-deno-1-43-compatible](https://supabase.com/changelog/27349-edge-functions-are-now-deno-1-43-compatible)

Supabase Edge Functions hosted platform now runs Edge Runtime v1.54, compatible with Deno 1.43. Local development with Supabase CLI v1.176.10 or later picks up the same compatibility.

---

## Dashboard Weekly Updates [03/06/24 - 10/06/24]

2024-06-11 · Improvement · Studio · [supabase.com/changelog/27166-dashboard-weekly-updates-03-06-24-10-06-24](https://supabase.com/changelog/27166-dashboard-weekly-updates-03-06-24-10-06-24)

Dashboard weekly roll-up from Consolidation Month: new alerts for client crashes, Vitest and Playwright test infrastructure, and Table and SQL Editor safeguards for large workloads.

---

## @supabase/ssr updates and roadmap towards v1.0.0

2024-06-05 · Improvement · Auth · [supabase.com/changelog/27037-supabase-ssr-updates-and-roadmap-towards-v1-0-0](https://supabase.com/changelog/27037-supabase-ssr-updates-and-roadmap-towards-v1-0-0)

The `@supabase/ssr` package moves to its own repo and a v0.4 reimplementation in mid-June 2024, with a new `getAll`/`setAll` cookie API. The current API will be deprecated at v1.0.0.

---

## Log Drains Private Alpha

2024-05-22 · New Feature · Observability · [supabase.com/changelog/26650-log-drains-private-alpha](https://supabase.com/changelog/26650-log-drains-private-alpha)

Supabase Log Drains enter Private Alpha for Team and Enterprise customers, starting with Datadog. Elastic/Filebeat and Syslog are in the works. Sign up via the interest form.

---

## Updated deployment instructions for supabase-grafana monitoring application

2024-05-17 · Bug Fix · Observability · [supabase.com/changelog/26421-updated-deployment-instructions-for-supabase-grafana-monitoring-application](https://supabase.com/changelog/26421-updated-deployment-instructions-for-supabase-grafana-monitoring-application)

The supabase-grafana Fly deployment instructions now add a persistent volume and disable auto-stop. Fly deployments from December 10, 2023 to May 16, 2024 should reapply the config.

---

## Dashboard Weekly Updates [06/05/24 - 13/05/24]

2024-05-15 · Improvement · Studio · [supabase.com/changelog/26327-dashboard-weekly-updates-06-05-24-13-05-24](https://supabase.com/changelog/26327-dashboard-weekly-updates-06-05-24-13-05-24)

Dashboard weekly roll-up: the conversational AI assistant in the SQL Editor is now on by default, and Postgres errors in the Table Editor surface more contextual hints.

---

## Developer Updates - April 2024

2024-05-08 · Improvement · AI, Auth, Platform, Security, Storage · [supabase.com/changelog/25860-developer-updates-april-2024](https://supabase.com/changelog/25860-developer-updates-april-2024)

April 2024 Developer Updates: Supabase reaches General Availability, plus Edge Functions AI model support, Auth anonymous sign-ins, Storage S3 protocol, and Security and Performance Advisors.

---

## JSR modules are supported in Edge Functions & Edge Runtime

2024-05-07 · New Feature · Edge Functions · [supabase.com/changelog/25842-jsr-modules-are-supported-in-edge-functions-edge-runtime](https://supabase.com/changelog/25842-jsr-modules-are-supported-in-edge-functions-edge-runtime)

Supabase Edge Functions now support JSR packages via `jsr:` imports, including modules like Oak. Local development requires Supabase CLI v1.166.1 or later.

---

## Dashboard Weekly Updates [22/04/24 - 29/04/24]

2024-04-30 · Improvement · Studio · [supabase.com/changelog/23433-dashboard-weekly-updates-22-04-24-29-04-24](https://supabase.com/changelog/23433-dashboard-weekly-updates-22-04-24-29-04-24)

Dashboard weekly roll-up: Table Editor foreign key fixes, SQL Editor column sizing, a Create policy CTA in Authentication, Storage upload size validation, and Query Performance search fixes.

---

## Dashboard Weekly Updates [15/04/24 - 22/04/24]

2024-04-22 · Improvement · Auth, Database, Security, Storage, Studio · [supabase.com/changelog/23139-dashboard-weekly-updates-15-04-24-22-04-24](https://supabase.com/changelog/23139-dashboard-weekly-updates-15-04-24-22-04-24)

Dashboard weekly roll-up from GA Week: Auth anonymous sign-ins, Storage S3 protocol support, new Security, Performance, and Index Advisors, and four new foreign data wrappers.

---

## Platform Updates: March 2024

2024-04-06 · Improvement · Platform · [supabase.com/changelog/22525-platform-updates-march-2024](https://supabase.com/changelog/22525-platform-updates-march-2024)

March 2024 Platform Updates: higher Supavisor client connection limits, a conversational AI assistant in the SQL Editor, port 6543 transaction-mode only, and v2 platform architecture migration.

---

## Increased Supavisor Client Connection Limits Across Paid Plans

2024-04-04 · Improvement · Platform · [supabase.com/changelog/22457-increased-supavisor-client-connection-limits-across-paid-plans](https://supabase.com/changelog/22457-increased-supavisor-client-connection-limits-across-paid-plans)

Supavisor client connection limits double or more on Small (400), Medium (600), Large (800), and XL (1,000) compute instances. Pricing is unchanged and the limits apply automatically.

---

## Realtime Broadcast and Presence Authorization

2024-04-04 · New Feature · Realtime · [supabase.com/changelog/22484-realtime-broadcast-and-presence-authorization](https://supabase.com/changelog/22484-realtime-broadcast-and-presence-authorization)

Realtime Authorization for Broadcast and Presence is now in Public Beta, gating channel access via Postgres RLS policies on the `realtime.messages` table.

---

## Dashboard Weekly Updates [18/03/24 - 25/03/24]

2024-03-26 · Improvement · Studio · [supabase.com/changelog/22222-dashboard-weekly-updates-18-03-24-25-03-24](https://supabase.com/changelog/22222-dashboard-weekly-updates-18-03-24-25-03-24)

Dashboard weekly roll-up: a hybrid RLS policy editor that shows the underlying SQL, and Supavisor pooler port 6543 set to transaction mode only with session mode on 5432.

---

## Migration to v2 platform architecture

2024-03-20 · Improvement · Platform · [supabase.com/changelog/22135-migration-to-v2-platform-architecture](https://supabase.com/changelog/22135-migration-to-v2-platform-architecture)

Supabase Platform v2 architecture rolls out to Free Plan projects from March 20, 2024, unbundling Storage, Realtime, and the pooler. Existing projects migrate gradually with email notice.

---

## Dashboard Weekly Updates [04/03/24 - 11/03/24]

2024-03-12 · Improvement · Studio · [supabase.com/changelog/21974-dashboard-weekly-updates-04-03-24-11-03-24](https://supabase.com/changelog/21974-dashboard-weekly-updates-04-03-24-11-03-24)

Dashboard weekly roll-up: a conversational AI assistant lands in the SQL Editor as a feature preview, plus fixes to table creation, snippet names, and the new RLS UI.

---

## Platform Updates: February 2024

2024-03-06 · Improvement · AI, Data APIs, Platform · [supabase.com/changelog/21823-platform-updates-february-2024](https://supabase.com/changelog/21823-platform-updates-february-2024)

February 2024 Platform Updates: Matryoshka embeddings for vector search, framework Connect snippets in Studio, PostgREST 12 aggregate functions, and an official Supabase Terraform provider.

---

## Dashboard Weekly Updates [26/02/24 - 04/03/24]

2024-03-04 · Improvement · Studio · [supabase.com/changelog/21732-dashboard-weekly-updates-26-02-24-04-03-24](https://supabase.com/changelog/21732-dashboard-weekly-updates-26-02-24-04-03-24)

Dashboard weekly roll-up: templates and richer prompts in the RLS assistant, collapsible navigation, SQL Editor charts, and foreign key management restored to the column side panel.

---

## Dashboard Weekly Updates [19/02/24 - 26/02/24]

2024-02-26 · Improvement · Studio · [supabase.com/changelog/21563-dashboard-weekly-updates-19-02-24-26-02-24](https://supabase.com/changelog/21563-dashboard-weekly-updates-19-02-24-26-02-24)

Dashboard weekly roll-up: launch paid projects on bigger compute immediately, a more prominent Table Editor search, resizable Table and SQL Editor sidebars, and Expo React Native connect guides.

---

## Paid organizations can now launch projects on bigger compute immediately

2024-02-20 · New Feature · Platform · [supabase.com/changelog/21386-paid-organizations-can-now-launch-projects-on-bigger-compute-immediately](https://supabase.com/changelog/21386-paid-organizations-can-now-launch-projects-on-bigger-compute-immediately)

Paid Supabase organizations can now pick a larger compute size when creating a project, skipping the previous Micro-then-upgrade flow. Up- and downgrades remain available.

---

## Dashboard Weekly Updates [12/02/24 - 19/02/24]

2024-02-19 · Improvement · Studio · [supabase.com/changelog/21366-dashboard-weekly-updates-12-02-24-19-02-24](https://supabase.com/changelog/21366-dashboard-weekly-updates-12-02-24-19-02-24)

Dashboard weekly roll-up: Connect button on project home with framework and ORM snippets, refreshed Table Editor sidebar and header, and an Auth user details view.

---

## Dashboard Weekly Updates [05/02/24 - 12/02/24]

2024-02-13 · Improvement · Studio · [supabase.com/changelog/21219-dashboard-weekly-updates-05-02-24-12-02-24](https://supabase.com/changelog/21219-dashboard-weekly-updates-05-02-24-12-02-24)

Dashboard weekly roll-up: bulk delete in the SQL Editor, query performance search and sort, a refreshed Logs Explorer, and Table Editor support for composite foreign keys.

---

## Platform Updates: January 2024

2024-02-06 · Improvement · Edge Functions, Platform, Storage, Studio · [supabase.com/changelog/21042-platform-updates-january-2024](https://supabase.com/changelog/21042-platform-updates-january-2024)

January 2024 Platform Updates: Supavisor replaces PgBouncer for pooling, direct connections move to IPv6 with an IPv4 add-on available, plus Studio table-editor and email-template enhancements.

---

## Dashboard Weekly Updates [22/01/24 - 29/01/24]

2024-01-30 · Improvement · Studio · [supabase.com/changelog/20863-dashboard-weekly-updates-22-01-24-29-01-24](https://supabase.com/changelog/20863-dashboard-weekly-updates-22-01-24-29-01-24)

Dashboard weekly roll-up: clearer organization billing breakdown, SQL Editor snippet previews, larger Table Editor text cell editing with Markdown preview, and Auth email template preview.

---

## Dashboard Weekly Updates [15/01/24 - 22/01/24]

2024-01-22 · Improvement · Studio · [supabase.com/changelog/20622-dashboard-weekly-updates-15-01-24-22-01-24](https://supabase.com/changelog/20622-dashboard-weekly-updates-15-01-24-22-01-24)

Dashboard weekly roll-up: simplified Database connection UI, IPv6 support and normalization for Network Restrictions, the new IPv4 add-on toggle, and removal of the legacy LinkedIn provider.

---

## IPv4 addon for projects available

2024-01-17 · New Feature · Platform · [supabase.com/changelog/20512-ipv4-addon-for-projects-available](https://supabase.com/changelog/20512-ipv4-addon-for-projects-available)

Paid Supabase projects can now enable an IPv4 add-on for direct database connections at $4 per month. Projects using Supavisor or supporting IPv6 do not need it.

---

## Supavisor starts enforcing Network Restrictions

2024-01-17 · Improvement · Platform · [supabase.com/changelog/20522-supavisor-starts-enforcing-network-restrictions](https://supabase.com/changelog/20522-supavisor-starts-enforcing-network-restrictions)

From January 24, 2024, Supavisor enforces project Network Restrictions. Existing restrictions propagate automatically; projects without restrictions are unaffected.

---

## Dashboard Weekly Updates [08/01/24 - 15/01/24]

2024-01-15 · Improvement · Studio · [supabase.com/changelog/20430-dashboard-weekly-updates-08-01-24-15-01-24](https://supabase.com/changelog/20430-dashboard-weekly-updates-08-01-24-15-01-24)

Dashboard weekly roll-up: column-level privileges management in the dashboard, Table Editor cell copy shortcuts, role-impersonation safeguards, and a Storage Explorer empty-bucket action.

---

## Platform Updates December 2023

2024-01-11 · Improvement · Platform · [supabase.com/changelog/20346-platform-updates-december-2023](https://supabase.com/changelog/20346-platform-updates-december-2023)

Launch Week X recap: Studio AI Assistant and user impersonation, Edge Functions Node and npm support, Supabase Branching, Auth Identity Linking and Hooks, and Read Replicas.

---

## Supavisor 1.1.6

2024-01-11 · Bug Fix · Platform · [supabase.com/changelog/20358-supavisor-1-1-6](https://supabase.com/changelog/20358-supavisor-1-1-6)

Supavisor 1.1.6 fixes a bug that caused prepared statements to fail when using session mode. No action required.

---

## Supavisor 1.1.5

2024-01-10 · Improvement · Platform · [supabase.com/changelog/20313-supavisor-1-1-5](https://supabase.com/changelog/20313-supavisor-1-1-5)

Supavisor 1.1.5 starts pools with 10 connections and grows up to the tenant pool size, preventing over-allocation of Postgres `max_connections` during PgBouncer migrations.

---

## Dashboard Weekly Updates [01/01/24 - 01/08/24]

2024-01-08 · Improvement · Studio · [supabase.com/changelog/20231-dashboard-weekly-updates-01-01-24-01-08-24](https://supabase.com/changelog/20231-dashboard-weekly-updates-01-01-24-01-08-24)

Dashboard weekly roll-up: smoother Auth users pagination, fixes for RLS schema selection and uppercase enum deletion, and alphabetical sorting for RLS policies.

---

## Supavisor v1.1.2 - allow_list and client_heartbeat_interval

2024-01-05 · Improvement · Platform · [supabase.com/changelog/20195-supavisor-v1-1-2-allow-list-and-client-heartbeat-interval](https://supabase.com/changelog/20195-supavisor-v1-1-2-allow-list-and-client-heartbeat-interval)

Supavisor v1.1.2 adds an `allow_list` field on tenants for CIDR-based network restrictions and a configurable `client_heartbeat_interval` to detect dead client connections.

---

## Threshold for transitioning projects to physical backups lowered to 40GB

2024-01-03 · Improvement · Platform · [supabase.com/changelog/20122-threshold-for-transitioning-projects-to-physical-backups-lowered-to-40gb](https://supabase.com/changelog/20122-threshold-for-transitioning-projects-to-physical-backups-lowered-to-40gb)

Supabase Platform lowers the daily physical-backup threshold to 40 GB. Restores work as before, but backups taken this way are no longer downloadable from the dashboard.

---

## Dashboard Weekly Updates [11th Dec - 18th Dec]

2023-12-18 · Improvement · Studio · [supabase.com/changelog/19827-dashboard-weekly-updates-11th-dec-18th-dec](https://supabase.com/changelog/19827-dashboard-weekly-updates-11th-dec-18th-dec)

Supabase Studio Launch Week X follow-up: AI-assisted RLS editor, Postgres role and user impersonation across editors, the Realtime Inspector, and a new Feature Previews surface.

---

## April Beta 2021

2023-12-13 · Improvement · Database, Storage, Studio · [supabase.com/changelog/19688-april-beta-2021](https://supabase.com/changelog/19688-april-beta-2021)

Supabase April 2021 update: Dashboard Light Mode ships, the main repo is internationalized into 20+ languages, and the open-source Stripe Sync Engine is released for experimentation.

---

## August Beta 2021

2023-12-13 · Improvement · Auth, Platform, Realtime, Studio, supabase-flutter · [supabase.com/changelog/19692-august-beta-2021](https://supabase.com/changelog/19692-august-beta-2021)

Supabase August 2021 update: closed a $30M Series A, opened the WALRUS RLS-for-Realtime RFC, launched the Seoul region, and added custom SMS templates to Auth.

---

## July Beta 2021

2023-12-13 · Improvement · Auth, Data APIs, Database, Storage, Studio, supabase-flutter · [supabase.com/changelog/19691-july-beta-2021](https://supabase.com/changelog/19691-july-beta-2021)

Supabase July 2021 update: Launch Week II ships Auth v2 with phone OTP, Storage Beta with public buckets and streaming, Dashboard v2, and Postgres 13 for new projects.

---

## June Beta 2021

2023-12-13 · Improvement · Auth, Database, Storage · [supabase.com/changelog/19690-june-beta-2021](https://supabase.com/changelog/19690-june-beta-2021)

Supabase June 2021 update: Vercel integration, Discord OAuth login, public Storage buckets and upserts, a Table Policy editor, and new guides for Postgres Full-Text Search and OAuth.

---

## May Beta 2021 [d]

2023-12-13 · Improvement · Platform · [supabase.com/changelog/19689-may-beta-2021-d](https://supabase.com/changelog/19689-may-beta-2021-d)

Supabase May 2021 update: Apple and Twitter OAuth providers ship, the Tokyo region opens, a new Storage policy editor lands, and community Go and Swift libraries kick off.

---

## October Beta 2021

2023-12-13 · Improvement · Auth, Data APIs, Studio, supabase-js · [supabase.com/changelog/19694-october-beta-2021](https://supabase.com/changelog/19694-october-beta-2021)

Supabase October 2021 update: Slack, Spotify, and MessageBird Auth providers, multi-schema support in the Dashboard and API, plus new Database Functions and Auth guides.

---

## Platform Update February 2023

2023-12-13 · Improvement · CLI, Database, Edge Functions, Studio, supabase-js · [supabase.com/changelog/19700-platform-update-february-2023](https://supabase.com/changelog/19700-platform-update-february-2023)

Supabase February 2023 update: GraphiQL editor in the Dashboard, pgvector-powered docs search, Edge Functions CLI multi-serve, and a 1.3GB-to-250MB Postgres Docker image rebuild.

---

## Platform update January 2023

2023-12-13 · Improvement · AI, Auth, Database, Storage, supabase-py · [supabase.com/changelog/19699-platform-update-january-2023](https://supabase.com/changelog/19699-platform-update-january-2023)

Supabase January 2023 update: pgvector ships for storing OpenAI embeddings, Supabase Clippy launches docs search, and pg_graphql adds Views, Materialized Views, and Foreign Tables.

---

## Platform Update September 2022

2023-12-13 · Improvement · Auth, Database, Edge Functions, Security · [supabase.com/changelog/19696-platform-update-september-2022](https://supabase.com/changelog/19696-platform-update-september-2022)

Supabase September 2022 update: three Kaizen weeks close 250+ issues, Auth UI launches on Product Hunt, and an open-source Postgres WASM ships with Snaplet.

---

## Platform update September 2023

2023-12-13 · Improvement · AI, Auth, Database, Edge Functions, Platform, Realtime · [supabase.com/changelog/19706-platform-update-september-2023](https://supabase.com/changelog/19706-platform-update-september-2023)

Supabase September 2023 update: Realtime broadcast via REST, Supavisor pooling on all new projects, the Airtable Foreign Data Wrapper, and HNSW support in the Vecs Python client.

---

## Platform updates: 30 Nov 2021

2023-12-13 · Improvement · Auth, Data APIs, Database, Realtime, Storage · [supabase.com/changelog/19695-platform-updates-30-nov-2021](https://supabase.com/changelog/19695-platform-updates-30-nov-2021)

Supabase November 2021 platform update: PostgREST 9.0, Realtime 0.19.0, Storage 0.10.0, GoTrue 2.2.10, and Postgres 14.1 for new projects. Custom auth functions need updating for PG14.

---

## Platform updates: April 2023

2023-12-13 · Improvement · Auth, Data APIs, Database, Edge Functions, Observability, Storage, Studio · [supabase.com/changelog/19701-platform-updates-april-2023](https://supabase.com/changelog/19701-platform-updates-april-2023)

Supabase April 2023 Launch Week 7: open-source Supabase Logs, self-hosted Edge Runtime, Storage v3 with resumable 50GB uploads, SSO in Auth, Studio 2.0, and dbdev for Postgres packages.

---

## Platform updates: August 2023

2023-12-13 · Improvement · AI, Platform, Security, Studio · [supabase.com/changelog/19704-platform-updates-august-2023](https://supabase.com/changelog/19704-platform-updates-august-2023)

Supabase August 2023 Launch Week 8: pgvector 0.5.0 with HNSW, Hugging Face support, Studio 3.0, the Integrations Marketplace, Supavisor 1M-connection pooling, plus SOC 2 and HIPAA.

---

## Platform updates June 2023

2023-12-13 · Improvement · Auth, CLI, Database, Platform, Realtime, Storage · [supabase.com/changelog/19703-platform-updates-june-2023](https://supabase.com/changelog/19703-platform-updates-june-2023)

Supabase June 2023 update: native Sign in with Apple and Google in Auth, Kakao OAuth, a revamped billing experience in Studio, and a wave of CLI features for migrations and functions.

---

## Platform updates: May 2023

2023-12-13 · Improvement · AI, Auth, Database, Edge Functions, Security, Storage, Studio · [supabase.com/changelog/19702-platform-updates-may-2023](https://supabase.com/changelog/19702-platform-updates-may-2023)

Supabase May 2023 update: Supabase Vector toolkit launches, the Vault encrypted-secrets extension reaches all projects, and Next.js Auth Helpers add full App Router support with PKCE.

---

## Platform Updates November 2022

2023-12-13 · Improvement · Auth · [supabase.com/changelog/19698-platform-updates-november-2022](https://supabase.com/changelog/19698-platform-updates-november-2022)

Supabase November 2022 update: Remix Auth Helpers ship with supabase-js v2 and TypeScript support, plus a new Edgy Edge Functions video series and three new function examples.

---

## Platform updates: October 2022

2023-12-13 · Improvement · Auth, Database, Edge Functions, Storage, supabase-flutter, supabase-js · [supabase.com/changelog/19697-platform-updates-october-2022](https://supabase.com/changelog/19697-platform-updates-october-2022)

Supabase October 2022 update: supabase-js v2 and supabase-flutter v1 ship, the Next.js quickstart adopts Next.js 13, pgTAP database testing lands, and Edge Functions add GET/PUT/PATCH/DELETE.

---

## Platform updates: October 2023

2023-12-13 · Improvement · AI, Auth, Security, Storage, Studio · [supabase.com/changelog/19705-platform-updates-october-2023](https://supabase.com/changelog/19705-platform-updates-october-2023)

Supabase October 2023 update: `@supabase/ssr` launches for Next.js 14 server-side auth, pgvector outperforms Pinecone in benchmarks, and MFA arrives for Supabase Studio accounts.

---

## September Beta 2021

2023-12-13 · Improvement · Auth, Database, supabase-js · [supabase.com/changelog/19693-september-beta-2021](https://supabase.com/changelog/19693-september-beta-2021)

Supabase September 2021 update: AbortController support in supabase-js for long-running queries, improved Table Editor column types and unique constraints, and revamped Auth docs.

---

## Supavisor 1.0

2023-12-13 · New Feature · Platform · [supabase.com/changelog/19669-supavisor-1-0](https://supabase.com/changelog/19669-supavisor-1-0)

Supavisor 1.0 ships with named prepared statements, read-replica query load balancing, a `client_idle_timeout` option, and a PgBouncer migration guide. Hosted rollout starts next week.

---

## Dashboard Weekly Updates [27th - 4th Dec]

2023-12-05 · Improvement · Studio · [supabase.com/changelog/19425-dashboard-weekly-updates-27th-4th-dec](https://supabase.com/changelog/19425-dashboard-weekly-updates-27th-4th-dec)

Supabase Studio weekly roundup: Table Editor side-panel renders the correct row values for Listbox columns, and branching now prompts you to turn on point-in-time recovery.

---

## Improved usage insights and transparency

2023-12-05 · Improvement · Platform · [supabase.com/changelog/19438-improved-usage-insights-and-transparency](https://supabase.com/changelog/19438-improved-usage-insights-and-transparency)

Supabase Studio ships a revamped organization usage page with per-project breakdowns, daily compute stats, custom timeframes, overage costs, and limit warnings.

---

## Directly updating rows in the `cron.job` table is no longer allowed

2023-11-29 · Breaking Change · Database · [supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed](https://supabase.com/changelog/19298-directly-updating-rows-in-the-cron-job-table-is-no-longer-allowed)

Supabase Database no longer allows direct inserts or updates on the pg_cron `cron.job` table. Schedule and modify jobs via the pg_cron functions documented in the guides.

---

## Dashboard Weekly Updates [20th Nov - 27th Nov]

2023-11-27 · Improvement · Studio · [supabase.com/changelog/19254-dashboard-weekly-updates-20th-nov-27th-nov](https://supabase.com/changelog/19254-dashboard-weekly-updates-20th-nov-27th-nov)

Supabase Studio weekly roundup: backups page accessible during restores, MFA status in organization members, SQL Editor migration/seed downloads, and Table Editor fixes.

---

## LinkedIn OAuth Provider deprecated in favour of LinkedIn (OIDC) Provider

2023-11-24 · Breaking Change · Auth · [supabase.com/changelog/19204-linkedin-oauth-provider-deprecated-in-favour-of-linkedin-oidc-provider](https://supabase.com/changelog/19204-linkedin-oauth-provider-deprecated-in-favour-of-linkedin-oidc-provider)

Supabase Auth deprecates the LinkedIn OAuth provider in favor of LinkedIn (OIDC). Projects using a pre-1 Aug 2023 LinkedIn app must migrate credentials by 4 Jan 2024.

---

## Edge Functions secrets should now get updated upon resetting DB password or JWT secret

2023-11-15 · Bug Fix · Edge Functions · [supabase.com/changelog/18972-edge-functions-secrets-should-now-get-updated-upon-resetting-db-password-or-jwt-secret](https://supabase.com/changelog/18972-edge-functions-secrets-should-now-get-updated-upon-resetting-db-password-or-jwt-secret)

Supabase Edge Functions secrets (`SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) now update automatically when you reset the database password or JWT secret.

---

## Column Encryption is SQL-only now

2023-11-09 · Breaking Change · Studio · [supabase.com/changelog/18849-column-encryption-is-sql-only-now](https://supabase.com/changelog/18849-column-encryption-is-sql-only-now)

Supabase Studio no longer offers Transparent Column Encryption in the Table Editor UI. Existing TCE columns keep working; new encryption must be managed via SQL and pgsodium.

---

## Connections to Postgres directly from an edge function are secured with SSL

2023-11-09 · Improvement · Edge Functions · [supabase.com/changelog/18845-connections-to-postgres-directly-from-an-edge-function-are-secured-with-ssl](https://supabase.com/changelog/18845-connections-to-postgres-directly-from-an-edge-function-are-secured-with-ssl)

Direct Postgres connections from Supabase Edge Functions are now secured with SSL automatically. No client configuration changes are required.

---

## Improved Realtime reliability when migrations fail for a project

2023-11-09 · Improvement · Realtime · [supabase.com/changelog/18861-improved-realtime-reliability-when-migrations-fail-for-a-project](https://supabase.com/changelog/18861-improved-realtime-reliability-when-migrations-fail-for-a-project)

Supabase Realtime handles failures of its internal `realtime` schema migrations more gracefully, improving reliability when projects connect. No action required.

---

## Large databases now use daily physical backups

2023-11-02 · Breaking Change · Platform · [supabase.com/changelog/18654-large-databases-now-use-daily-physical-backups](https://supabase.com/changelog/18654-large-databases-now-use-daily-physical-backups)

Databases over 100GB now use physical daily backups. Restores work as before, but these backups can no longer be downloaded from the dashboard.

---

## Postgres 12 Deprecation Notice

2023-10-14 · Deprecation · Database · [supabase.com/changelog/18198-postgres-12-deprecation-notice](https://supabase.com/changelog/18198-postgres-12-deprecation-notice)

Postgres 12 is deprecated. Self-serve upgrade to Postgres 15 opens 27 October 2023; all remaining Postgres 12 databases auto-upgrade on 2023-11-27.

---

## PGBouncer and IPv4 Deprecation

2023-09-29 · Deprecation · Platform · [supabase.com/changelog/17817-pgbouncer-and-ipv4-deprecation](https://supabase.com/changelog/17817-pgbouncer-and-ipv4-deprecation)

PgBouncer and direct IPv4 database connections are deprecated. Projects must migrate to Supavisor or the IPv4 add-on by 2024-01-26; `db.projectref.supabase.co` resolves to IPv6.

---

## Moving to Org-based billing

2023-08-31 · Policy · Platform · [supabase.com/changelog/17061-moving-to-org-based-billing](https://supabase.com/changelog/17061-moving-to-org-based-billing)

Supabase billing moves from project-based to organization-based, adding project transfers, consolidated invoices, a self-serve Team plan, and 1GB extra Free egress.

---

## Security Patch Notice

2022-10-04 · Security · Security · [supabase.com/changelog/9314-security-patch-notice](https://supabase.com/changelog/9314-security-patch-notice)

Supabase is removing superuser access from the dashboard SQL Editor. Affected projects must run a one-time migration during the opt-in period (5 Oct to 5 Nov 2022).
