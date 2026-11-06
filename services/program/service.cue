package codegen

// The program subgraph (#1772): talks, schedule and public speaker profiles,
// read-only and tenant-scoped by the envelope. Step 1 of DATA_OWNERSHIP rule
// 3: it proxies Sanity behind a ProgramSource; a D1 source can replace it
// later without touching the schema.
// Secret per env: SANITY_API_TOKEN_READ (the site's read token name).
service: #PlatformService & {
	name: "program"
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY", "SANITY_API_TOKEN_READ"]
	}
	db:   false
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	// programDate is D1-owned (#2023): read from conference's ProgramDate
	// entrypoint, never from Sanity.
	serviceBindings: [{binding: "CONFERENCE", service: "konf-conference", entrypoint: "ProgramDate"}]
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
