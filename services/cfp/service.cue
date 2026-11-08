package codegen

// The cfp subgraph (#2057, step a #2077): public CFP options and the CFP's
// public outcome (confirmed talks), read-only and tenant-scoped by the
// envelope. Proxies Sanity behind a CfpSource. No proposal in draft,
// submitted, accepted, waitlisted or rejected state, no review and no
// speaker contact leaves it; authenticated reads come in steps b and c.
// Secret per env: SANITY_API_TOKEN_READ (the site's read token name).
service: #PlatformService & {
	name: "cfp"
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY", "SANITY_API_TOKEN_READ"]
	}
	db: false
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
