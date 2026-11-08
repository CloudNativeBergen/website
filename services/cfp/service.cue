package codegen

// The cfp subgraph (#2057, step a #2077): public CFP options and the CFP's
// public outcome (confirmed talks), read-only and tenant-scoped by the
// envelope. Proxies Sanity behind a CfpSource. No proposal in draft,
// submitted, accepted, waitlisted or rejected state, no review and no
// speaker contact leaves its public reads. Step b (#2078): a speaker reads
// and writes their own proposals; the speaker link and profile come from
// identity, CFP dates from conference (both D1-owned).
// Secrets per env: SANITY_API_TOKEN_READ and SANITY_API_TOKEN_WRITE (the
// site's token names).
service: #PlatformService & {
	name: "cfp"
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY", "SANITY_API_TOKEN_READ", "SANITY_API_TOKEN_WRITE"]
	}
	db: false
	// Preview never reads production data (epic #1772, req. 8).
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	serviceBindings: [
		{binding: "IDENTITY", service: "konf-identity", entrypoint: "SpeakerLink"},
		{binding: "CONFERENCE", service: "konf-conference", entrypoint: "ProgramDate"},
	]
	files: "package.json": dependencies: "@sanity/client": "^7.28.0"
}
