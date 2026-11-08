package codegen

// The ticketing subgraph (#2148, PRD #2144): ticket events, types and orders
// in D1, fed by the site's provider webhook over the `Ingest` entrypoint
// (service binding only, src/index.ts). Every row carries org_id and
// conference_id. Buyer email is PII: only `attendee.read_pii` reads it.
service: #PlatformService & {
	name: "ticketing"
	// konf-ticketing-preview and konf-ticketing (owner-approved).
	d1: {preview: "029d8d02-f07e-4d8a-90f6-8e7fb7ed4da3", production: "7ef04a98-8642-4437-bdf5-4c1cf789b4c8"}
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY"]
	}
	files: {
		// src/index.ts adds the Ingest entrypoint for the site's webhook.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
