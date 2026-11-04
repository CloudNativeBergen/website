package codegen

// Identity is a platform service (SPEC: tenancy-exempt). Users, sessions and
// memberships span Organizations, so no row carries a single tenant.
service: #PlatformService & {
	name: "identity"
	d1: {preview: "2192470e-1f18-40cc-813f-c18883237c78", production: "20c89ee4-f729-483b-8a0f-8fba00d4f411"}
	tenancy: false
	// The public host for sign-in and the login handoff (#1803).
	routes: {preview: ["id-preview.konf.app"], production: ["id.konf.app"]}
	// Last moment a NextAuth session may upgrade to an identity session (#1842).
	// Sanity ids as in services/content; preview reads development only.
	vars: {
		// LOGIN_TEST_PAGE serves the manual login test page at /test (preview only).
		preview: {IDENTITY_UPGRADE_UNTIL: "2026-12-03T00:00:00Z", LOGIN_TEST_PAGE: "1", SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development", MEMBER_SOURCE_ORGS: ""}
		// OPERATOR_ORIGINS: non-tenant origins whose token only platform
		// operators get (#1922). None in preview: kontroll has no stable
		// preview origin.
		production: {OPERATOR_ORIGINS: "https://my.konf.app", IDENTITY_UPGRADE_UNTIL: "2026-12-03T00:00:00Z", SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production", MEMBER_SOURCE_ORGS: ""}
	}
	// Organizer membership sync (#1907, src/data/member-sync.ts) has no cron
	// here: the account allows 5. tenant-directory's cron calls
	// Organizations.syncMembers() hourly. Secret per env: SANITY_API_TOKEN_READ.
	// Without it the sync grants nothing.
	// MEMBER_SOURCE_ORGS: comma-separated org ids whose membership source is
	// identity. Those orgs get drift checks and never grants (#1923). Empty:
	// every org grants, as before. Optional secret per env:
	// SLACK_MEMBER_DRIFT_WEBHOOK_URL (Slack incoming webhook for drift
	// alerts); unset, drift is logged only.
	// Verified origins for the login handoff (#688).
	serviceBindings: [{binding: "DIRECTORY", service: "konf-tenant-directory"}]
	// Handoff limits (src/handoff.ts): POSTs per tenant origin, GET per IP.
	rateLimits: [
		{name: "HANDOFF_SITE_LIMIT", namespaceId: {preview: "1803", production: "1813"}, limit: 60, period: 60},
		{name: "HANDOFF_IP_LIMIT", namespaceId: {preview: "1804", production: "1814"}, limit: 20, period: 60},
	]
	files: {
		"package.json": {
			dependencies: {
				// Exact pin: we own identity security. Bump only after reading
				// the advisories (GHSA, CVE-2025-61928 and later).
				"better-auth": "1.7.14"
				// Same pin: the request context the membership audit reads its actor from.
				"@better-auth/core": "1.7.14"
			}
			// A real D1 in tests, the same engine wrangler ships.
			devDependencies: {
				miniflare: "5.20261023.3-beta"
				// Verifies issued JWTs in tests, as the gateway will.
				jose: "^6.2.14"
			}
		}
		// src/index.ts serves Better Auth and the gateway's RPC entrypoint,
		// and 404s everything else.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
