package codegen

// The strangler-fig subgraph (#1835): today's Sanity data, read-only and
// tenant-scoped by the envelope. Native services take its fields over with
// @override(from: "legacy"); it is deleted once it has none left.
// Secret per env: SANITY_API_TOKEN_READ (the site's read token name).
service: #PlatformService & {
	name: "legacy"
	db:   false
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
