// Build-time composition: prints each subgraph's schema and composes the
// supergraph the gateway serves. `pnpm compose` writes it to
// api/supergraph.graphql; tests call compose() directly. This is the public
// contract: anything tagged @tag(internal) is cut before composition, and so
// is every type no longer reachable. Fields tagged @tag(operator) stay: they
// are refused at runtime by the subgraph's requirePlatform unless the gateway
// minted a PlatformContext (operator, no tenant header), and only that caller
// may introspect the schema (#1961). Owner-approved for #1924: one supergraph, no second runtime.
import {
  filterSchema,
  getDirective,
  printSchemaWithDirectives,
  pruneSchema,
} from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import {
  buildSchema,
  extendSchema,
  parse,
  printSchema,
  type GraphQLSchema,
} from 'graphql'
import { schema as content } from '../../services/content/src/subgraph'
import { schema as conference } from '../../services/conference/src/subgraph'
import { schema as program } from '../../services/program/src/subgraph'
import { schema as sponsors } from '../../services/sponsors/src/subgraph'
import { schema as identity } from '../../services/identity/src/subgraph'
import { schema as tenantDirectory } from '../../services/tenant-directory/src/subgraph'

/**
 * Subgraph name -> schema. The name is the host of the subgraph URL in the
 * supergraph, which the gateway maps to a service binding (see BINDINGS in
 * gateway.ts).
 */
export const SUBGRAPHS = {
  'tenant-directory': tenantDirectory,
  content,
  program,
  sponsors,
  conference,
  identity,
}

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

function composeAll() {
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
  return result
}

export const compose = (): string => composeAll().supergraphSdl!

/** The client-facing schema the gateway serves (no join directives). */
export const publicSdl = (): string => composeAll().publicSdl!

/** Fields the gateway itself serves (see gateway.ts), outside any subgraph. */
export const GATEWAY_TYPEDEFS = `
  type SiteRolloutFlags { apiRead: Boolean! identityLogin: Boolean! d1Write: Boolean! }
  extend type Query { health: String! rolloutFlags: SiteRolloutFlags }`

/** What a client sees: the public SDL plus the gateway's own fields. */
export const clientSdl = (): string =>
  printSchema(extendSchema(buildSchema(publicSdl()), parse(GATEWAY_TYPEDEFS)))
