/**
 * Fields the gateway itself serves (see gateway.ts), outside any subgraph.
 * Kept out of supergraph.ts: importing that from the Worker bundled the
 * composition library and built all eight subgraph schemas at every cold
 * start (worker-bundle.test.ts guards it).
 */
export const GATEWAY_TYPEDEFS = `
  type SiteRolloutFlags { apiRead: Boolean! identityLogin: Boolean! d1Write: Boolean! }
  extend type Query { health: String! rolloutFlags: SiteRolloutFlags }`
