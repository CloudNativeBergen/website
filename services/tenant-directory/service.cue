package codegen

service: #PlatformService & {
	name:    "tenant-directory"
	tenancy: false
	// Mirror Cloudflare custom-hostname status for pending domains.
	crons: ["*/5 * * * *"]
}
