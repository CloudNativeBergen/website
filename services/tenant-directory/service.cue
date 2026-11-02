package codegen

service: #PlatformService & {
	name:    "tenant-directory"
	tenancy: false
	// Mirror Cloudflare custom-hostname status for custom domains.
	crons: ["*/5 * * * *"]
	// provisionOrganization creates the org in identity too.
	serviceBindings: [{binding: "IDENTITY", service: "konf-identity", entrypoint: "Organizations"}]
}
