package codegen

// Identity is a platform service (SPEC: tenancy-exempt). Users, sessions and
// memberships span Organizations, so no row carries a single tenant.
service: #PlatformService & {
	name: "identity"
	d1: {preview: "2192470e-1f18-40cc-813f-c18883237c78", production: "20c89ee4-f729-483b-8a0f-8fba00d4f411"}
	tenancy: false
	// The public host for sign-in and the login handoff (#1803).
	routes: {preview: ["id-preview.konf.app"], production: ["id.konf.app"]}
	// Verified origins for the login handoff (#688).
	serviceBindings: [{binding: "DIRECTORY", service: "konf-tenant-directory"}]
	files: {
		"package.json": {
			dependencies: {
				// Exact pin: we own identity security. Bump only after reading
				// the advisories (GHSA, CVE-2025-61928 and later).
				"better-auth": "1.7.14"
			}
			// A real D1 in tests, the same engine wrangler ships.
			devDependencies: {
				miniflare: "5.20261023.3-beta"
				// Verifies issued JWTs in tests, as the gateway will.
				jose: "^6.2.14"
			}
		}
		// src/index.ts serves Better Auth and the gateway's RPC entrypoint,
		// and 404s everything else.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
