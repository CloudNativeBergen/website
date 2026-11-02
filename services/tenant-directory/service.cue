package codegen

service: #PlatformService & {
	name: "tenant-directory"
	d1: {preview: "82b1dd25-4dcd-4b18-b712-86eb02b5c0df", production: "73355a8e-33d8-4bf3-8115-013768c6520c"}
	tenancy: false
	// Mirror Cloudflare custom-hostname status for custom domains.
	crons: ["*/5 * * * *"]
	// provisionOrganization creates the org in identity too.
	// The Sanity backfill and register mappings (#1825).
	tsInclude: ["scripts/**/*.ts"]
	serviceBindings: [{binding: "IDENTITY", service: "konf-identity", entrypoint: "Organizations"}]
}
