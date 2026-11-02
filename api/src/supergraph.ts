// Build-time composition: prints each subgraph's schema and composes the
// supergraph the gateway serves. `pnpm compose` writes it to
// api/supergraph.graphql; tests call compose() directly. This is the public
// contract: @tag(internal) fields are cut before composition, so platform
// operations never reach the public gateway.
import { printSchemaWithDirectives } from '@graphql-tools/utils'
import { composeServices } from '@theguild/federation-composition'
import { Kind, parse, visit, type DocumentNode } from 'graphql'
import { schema as tenantDirectory } from '../../services/tenant-directory/src/subgraph'

/**
 * Subgraph name -> schema. The name is the host of the subgraph URL in the
 * supergraph, which the gateway maps to a service binding (see BINDINGS in
 * gateway.ts). Identity has no public subgraph.
 */
const SUBGRAPHS = { 'tenant-directory': tenantDirectory }

const isInternal = (node: { directives?: readonly unknown[] }) =>
  (
    node.directives as
      | {
          name: { value: string }
          arguments?: { value: { value?: string } }[]
        }[]
      | undefined
  )?.some(
    (d) =>
      d.name.value === 'tag' && d.arguments?.[0]?.value.value === 'internal',
  )

/** Drops @tag(internal) fields, then types and root operations left empty. */
function publicContract(doc: DocumentNode): DocumentNode {
  const emptied = new Set<string>()
  const pruned = visit(doc, {
    FieldDefinition: (node) => (isInternal(node) ? null : undefined),
    ObjectTypeDefinition: {
      leave: (node) => {
        if (node.fields?.length) return undefined
        emptied.add(node.name.value)
        return null
      },
    },
  })
  return visit(pruned, {
    OperationTypeDefinition: (node) =>
      emptied.has(node.type.name.value) ? null : undefined,
    [Kind.SCHEMA_DEFINITION]: {
      leave: (node) => (node.operationTypes.length ? undefined : null),
    },
    [Kind.SCHEMA_EXTENSION]: {
      leave: (node) =>
        node.operationTypes?.length || node.directives?.length
          ? undefined
          : null,
    },
  })
}

export function compose(): string {
  const result = composeServices(
    Object.entries(SUBGRAPHS).map(([name, schema]) => ({
      name,
      typeDefs: publicContract(parse(printSchemaWithDirectives(schema))),
      url: `https://${name}.internal/graphql`,
    })),
  )
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.message).join('\n'))
  }
  return result.supergraphSdl!
}
