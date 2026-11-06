package codegen

// The content subgraph (#1835): Sanity data, read-only and tenant-scoped by
// the envelope. It is permanent: editorial data lives here, and native
// services move only structured fields out with @override(from: "content").
// Secret per env: SANITY_API_TOKEN_READ (the site's read token name).
service: #PlatformService & {
	name: "content"
	_secrets: ["GATEWAY_PUBLIC_KEY", "SANITY_API_TOKEN_READ"]
	secrets: {preview: _secrets, production: _secrets}
	db:   false
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
