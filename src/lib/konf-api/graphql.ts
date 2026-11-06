// gql.tada typed against api/public-schema.graphql (`pnpm codegen` writes
// graphql-env.d.ts). Queries are still sent as plain strings; `graphql(q)`
// only gives `ResultOf<typeof doc>` the response type.
import { initGraphQLTada } from 'gql.tada'
import type { introspection } from './graphql-env'

export const graphql = initGraphQLTada<{ introspection: introspection }>()
export type { ResultOf } from 'gql.tada'
