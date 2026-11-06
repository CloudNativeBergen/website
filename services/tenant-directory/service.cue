package codegen

service: #PlatformService & {
	name: "tenant-directory"
	d1: {preview: "82b1dd25-4dcd-4b18-b712-86eb02b5c0df", production: "73355a8e-33d8-4bf3-8115-013768c6520c"}
	tenancy: false
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY"]
		// Degrades without these: provisioning and custom-hostname registration refuse.
		optional: ["SANITY_API_TOKEN_READ", "CF_API_TOKEN", "CF_ZONE_ID"]
	}
	// Mirror Cloudflare custom-hostname status for custom domains.
	crons: ["*/5 * * * *"]
	// provisionOrganization creates the org in identity too.
	// The Sanity backfill and register mappings (#1825).
	tsInclude: ["scripts/**/*.ts"]
	// provisionOrganization verifies org, conference and hosts against Sanity
	// before any D1 write (#1924). Secret per env: SANITY_API_TOKEN_READ.
	// Without it provisioning refuses. Preview reads development only.
	vars: {
		preview: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "development"}
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production"}
	}
	serviceBindings: [{binding: "IDENTITY", service: "konf-identity", entrypoint: "Organizations"}]
}
