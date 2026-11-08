package codegen

// The ticketing subgraph (#2148, PRD #2144): ticket events, types and orders
// in D1, fed by the site's provider webhook over the `Ingest` entrypoint
// (service binding only, src/index.ts). Every row carries org_id and
// conference_id. Buyer email is PII: only `attendee.read_pii` reads it.
// The owner creates the databases once (`wrangler d1 create
// konf-ticketing[-preview]`) and commits the ids in `d1` below.
service: #PlatformService & {
	name: "ticketing"
	secrets: {
		required: ["GATEWAY_PUBLIC_KEY"]
	}
	files: {
		// src/index.ts adds the Ingest entrypoint for the site's webhook.
		"wrangler.jsonc": main: "src/index.ts"
	}
}
