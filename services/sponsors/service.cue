package codegen

// The sponsors subgraph (#1772): the conference's public sponsor list and
// tiers, read-only and tenant-scoped by the envelope. Step 1 of
// DATA_OWNERSHIP rule 3: it proxies Sanity behind a SponsorSource; nothing
// from the CRM (contacts, contract, price, invoice) leaves it.
// Secret per env: SANITY_API_TOKEN_READ (the site's read token name).
service: #PlatformService & {
	name: "sponsors"
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
