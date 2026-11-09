package codegen

// Platform notifications (epic #2215, phase 1). Services hand it typed events
// over a service binding (`"entrypoint": "Notifications"`); it re-reads the
// proposal from Sanity, derives tenant and recipients, dedupes per event id in
// D1, posts the Slack alert and writes the organizers' in-app notifications.
// No public route and no GraphQL: RPC only.
// Security: every Worker that binds `Notifications` is trusted for orgId,
// previousStatus and the event id it sends. Adding a binder needs a security
// review.
service: #PlatformService & {
	name:     "notifications"
	subgraph: false
	d1: {preview: "7a5e4989-9b71-4e1b-9143-c10a97cbd9be", production: "e3b444c7-2111-43a3-a003-f2fe237e5ca1"}
	secrets: {
		// All optional so a deploy passes before the values are synced. Without
		// the Sanity tokens nothing is sent; without a Slack token (per-org in
		// TENANT_SECRETS_JSON, or SLACK_BOT_TOKEN for slack-mirror orgs) the
		// Slack alert is skipped. PLATFORM_ORG_ID: the site's value; it keeps
		// the platform org's slack-mirror default (src/lib/features/slack.ts).
		optional: ["SANITY_API_TOKEN_READ", "SANITY_API_TOKEN_WRITE", "SLACK_BOT_TOKEN", "TENANT_SECRETS_JSON", "PLATFORM_ORG_ID"]
	}
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	// The CFP Slack channel is D1-owned (cfpNotificationChannel).
	serviceBindings: [{binding: "CONFERENCE", service: "konf-conference", entrypoint: "ProgramDate"}]
	files: {
		"package.json": dependencies: "@sanity/client": "^7.28.0"
		// src/index.ts: the `Notifications` RPC entrypoint; fetch 404s.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
