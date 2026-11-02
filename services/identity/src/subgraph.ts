// identity: author the Pothos federation subgraph here.
import { builder } from './builder'

// Add types and fields on `builder`; reach data via ctx.data.
// toSubGraphSchema supplies Query._service, so an empty service
// still starts.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
})
