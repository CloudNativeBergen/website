package codegen

service: #PlatformService & {
	name: "tenant-directory"
	d1: {preview: "82b1dd25-4dcd-4b18-b712-86eb02b5c0df", production: "73355a8e-33d8-4bf3-8115-013768c6520c"}
	tenancy: false
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY"]
		// Degrades without these: provisioning and custom-hostname registration refuse.
		optional: ["SANITY_API_TOKEN_READ", "CF_API_TOKEN", "CF_ZONE_ID", "PROVISIONING_SIGNING_KEY"]
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
		production: {SANITY_PROJECT_ID: "mvzwvw14", SANITY_DATASET: "production", SITE_URL: "https://auth.konf.app"}
	}
	// createOrganization (RunKonf/kontroll#79) asks the site to write the
	// Sanity docs: POST SITE_URL/api/provisioning/service/organizations,
	// signed with PROVISIONING_SIGNING_KEY (private Ed25519 JWK with kid; the
	// site holds the public half in TENANT_DIRECTORY_PUBLIC_KEYS). Without
	// SITE_URL or the key, createOrganization refuses. Preview sets no
	// SITE_URL: no preview site writes to a dataset the worker can trust yet.
	files: {
		"package.json": dependencies: jose: "^6.2.14"
		// src/index.ts adds the SiteMail entrypoint (#2130) to the generated worker.
		"wrangler.jsonc": main: "src/index.ts"
	}
	serviceBindings: [{binding: "IDENTITY", service: "konf-identity", entrypoint: "Organizations"}]
}
