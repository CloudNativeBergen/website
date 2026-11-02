// Build-time composition: prints each subgraph's schema and composes the
// supergraph the gateway serves. `pnpm compose` writes it to
// api/supergraph.graphql; tests call compose() directly.
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import { parse } from 'graphql'
import { schema as tenantDirectory } from '../../services/tenant-directory/src/subgraph'

/**
 * Subgraph name -> schema. The name is the host of the subgraph URL in the
 * supergraph, which the gateway maps to a service binding (see BINDINGS in
 * gateway.ts). Identity has no public subgraph.
 */
const SUBGRAPHS = { 'tenant-directory': tenantDirectory }

export function compose(): string {
  const result = composeServices(
    Object.entries(SUBGRAPHS).map(([name, schema]) => ({
      name,
      typeDefs: parse(printSchemaWithDirectives(schema)),
      url: `https://${name}.internal/graphql`,
    })),
  )
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join('\n'))
  }
  return result.supergraphSdl!
}
