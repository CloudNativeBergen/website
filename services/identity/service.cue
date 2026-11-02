package codegen

// Identity is a platform service (SPEC: tenancy-exempt). Users, sessions and
// memberships span Organizations, so no row carries a single tenant.
service: #PlatformService & {
	name:    "identity"
	tenancy: false
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
		// and delegates the rest to the generated src/worker.ts.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
