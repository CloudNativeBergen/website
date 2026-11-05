package codegen

service: #PlatformService & {
	name: "conference"
	// konf-conference-preview and konf-conference (owner-approved).
	d1: {preview: "f6e9d558-db2e-4200-8afc-c1f95655bf5e", production: "245b474a-5dfe-410f-98fa-97cc13813869"}
	tsInclude: ["scripts/**/*.ts"]
	// Daily D1 vs Sanity parity sweep, alert-only (#1892). src/data/parity.ts.
	// Secrets per env: SANITY_API_TOKEN_READ (the content Worker's name);
	// SLACK_CONFERENCE_PARITY_WEBHOOK_URL (optional; unset, log only).
	crons: ["17 4 * * *"]
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
