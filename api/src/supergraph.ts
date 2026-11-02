// Build-time composition: prints each subgraph's schema and composes the
// supergraph the gateway serves. `pnpm compose` writes it to
// api/supergraph.graphql; tests call compose() directly. This is the public
// contract: anything tagged @tag(internal) is cut before composition, and so
// is every type no longer reachable, so platform operations never reach the
// public gateway.
import {
  filterSchema,
  getDirective,
  printSchemaWithDirectives,
  pruneSchema,
} from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import { parse, type GraphQLSchema } from 'graphql'
import { schema as content } from '../../services/content/src/subgraph'
import { schema as tenantDirectory } from '../../services/tenant-directory/src/subgraph'

/**
 * Subgraph name -> schema. The name is the host of the subgraph URL in the
 * supergraph, which the gateway maps to a service binding (see BINDINGS in
 * gateway.ts). Identity has no public subgraph.
 */
const SUBGRAPHS = { 'tenant-directory': tenantDirectory, content }

/** Drops @tag(internal) types, fields, args and enum values, then prunes. */
export function publicContract(schema: GraphQLSchema): GraphQLSchema {
  const keep = (node: object | undefined) =>
    !node ||
    !getDirective(schema, node as never, 'tag')?.some(
      (t) => t.name === 'internal',
    )
  return pruneSchema(
    filterSchema({
      schema,
      typeFilter: (_, type) => keep(type),
      rootFieldFilter: (_, __, config) => keep(config),
      fieldFilter: (_, __, config) => keep(config),
      argumentFilter: (_, __, ___, config) => keep(config),
      enumValueFilter: (_, __, config) => keep(config),
    }),
  )
}

export function compose(): string {
  const result = composeServices(
    Object.entries(SUBGRAPHS).map(([name, schema]) => ({
      name,
      typeDefs: parse(printSchemaWithDirectives(publicContract(schema))),
      url: `https://${name}.internal/graphql`,
    })),
  )
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join('\n'))
  }
  return result.supergraphSdl!
}
