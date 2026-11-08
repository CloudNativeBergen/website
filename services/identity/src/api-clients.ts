// API clients and personal access tokens (#2115, RunKonf/kontroll#70): the
// schema-first contract. Every resolver runs its authorization check, then
// refuses with NOT_IMPLEMENTED, so nothing is stored or exposed until the
// implementation PR. See docs/API_CLIENTS.md.
import { createGraphQLError } from 'graphql-yoga'
import { can, principalOf, type Action } from '@runkonf/tenancy'
import { builder } from './builder'
import type { ResolverContext } from './worker'

/** Wire value (`resource:read|write`) per enum value. `write` implies `read`. */
export const API_SCOPES = {
  CONFERENCE_READ: 'conference:read',
  CONFERENCE_WRITE: 'conference:write',
  PROGRAM_READ: 'program:read',
  PROGRAM_WRITE: 'program:write',
  CFP_READ: 'cfp:read',
  CFP_WRITE: 'cfp:write',
  SPONSORS_READ: 'sponsors:read',
  SPONSORS_WRITE: 'sponsors:write',
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  MEMBERS_READ: 'members:read',
  PII_READ: 'pii:read',
} as const

const ApiScope = builder.enumType('ApiScope', {
  description:
    'A grantable token scope. No platform scope exists. Write implies read. PII_READ is owner-granted only and off by default.',
  values: Object.fromEntries(
    Object.entries(API_SCOPES).map(([k, v]) => [k, { description: v }]),
  ) as Record<keyof typeof API_SCOPES, { description: string }>,
})

type ClientRow = {
  id: string
  name: string
  scopes: (keyof typeof API_SCOPES)[]
  createdBy: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
type PatRow = ClientRow & { expiresAt: string }

// List types: never a secret, a hash or the token itself.
const ApiClient = builder.objectRef<ClientRow>('ApiClient').implement({
  description:
    'A machine principal bound to one org, authorized by its scopes only.',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    scopes: t.field({ type: [ApiScope], resolve: (c) => c.scopes }),
    createdBy: t.exposeID('createdBy', { description: 'User id.' }),
    createdAt: t.exposeString('createdAt'),
    lastUsedAt: t.exposeString('lastUsedAt', { nullable: true }),
    revokedAt: t.exposeString('revokedAt', { nullable: true }),
  }),
})

const PersonalAccessToken = builder
  .objectRef<PatRow>('PersonalAccessToken')
  .implement({
    description:
      "A user's token for one org. Effective permission: the user's live role ∩ scopes.",
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name'),
      scopes: t.field({ type: [ApiScope], resolve: (c) => c.scopes }),
      createdAt: t.exposeString('createdAt'),
      expiresAt: t.exposeString('expiresAt'),
      lastUsedAt: t.exposeString('lastUsedAt', { nullable: true }),
      revokedAt: t.exposeString('revokedAt', { nullable: true }),
    }),
  })

// Payloads that carry the secret: create and rotate only, shown once.
const ApiClientSecretPayload = builder
  .objectRef<{ client: ClientRow; clientSecret: string }>(
    'ApiClientSecretPayload',
  )
  .implement({
    fields: (t) => ({
      client: t.field({ type: ApiClient, resolve: (p) => p.client }),
      clientSecret: t.exposeString('clientSecret', {
        description:
          '`konf_cs_<id>_<secret>`. Returned once; only a hash is stored.',
      }),
    }),
  })

const PersonalAccessTokenPayload = builder
  .objectRef<{ token: PatRow; secret: string }>('PersonalAccessTokenPayload')
  .implement({
    fields: (t) => ({
      token: t.field({ type: PersonalAccessToken, resolve: (p) => p.token }),
      secret: t.exposeString('secret', {
        description:
          '`konf_pat_<id>_<secret>`. Returned once; only a hash is stored.',
      }),
    }),
  })

const CreateApiClientInput = builder.inputType('CreateApiClientInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    scopes: t.field({ type: [ApiScope], required: true }),
  }),
})

const CreatePersonalAccessTokenInput = builder.inputType(
  'CreatePersonalAccessTokenInput',
  {
    fields: (t) => ({
      name: t.string({ required: true }),
      scopes: t.field({ type: [ApiScope], required: true }),
      expiresAt: t.string({
        required: true,
        description: 'ISO 8601, at most one year ahead.',
      }),
    }),
  },
)

/**
 * Tenant lane with a signed-in user only: a client or PAT principal never
 * manages clients or PATs, whatever its scopes. Then the matrix row.
 */
function authorize(ctx: ResolverContext, action: Action) {
  const e = ctx.envelope
  if (e?.typ !== 'tenant' || !e.userId || !can(principalOf(e), action))
    throw createGraphQLError('Not allowed to manage API credentials', {
      extensions: { code: 'FORBIDDEN' },
    })
}

const notImplemented = (): never => {
  throw createGraphQLError('Not implemented yet', {
    extensions: { code: 'NOT_IMPLEMENTED' },
  })
}

const guarded =
  (action: Action) =>
  (_: unknown, __: unknown, ctx: ResolverContext): never => {
    authorize(ctx, action)
    return notImplemented()
  }

/** Reads follow the subgraph's convention: null for a caller without access. */
const guardedRead =
  (action: Action) =>
  (_: unknown, __: unknown, ctx: ResolverContext): null => {
    const e = ctx.envelope
    if (e?.typ !== 'tenant' || !e.userId || !can(principalOf(e), action))
      return null
    return notImplemented()
  }

builder.queryFields((t) => ({
  apiClients: t.field({
    type: [ApiClient],
    nullable: true,
    description:
      "The session org's API clients, without secrets. Owners, admins and operators; null otherwise.",
    resolve: guardedRead('api_client.read'),
  }),
  myPersonalAccessTokens: t.field({
    type: [PersonalAccessToken],
    nullable: true,
    description:
      "The session user's tokens for the session org, without secrets. Null without an org role.",
    resolve: guardedRead('pat.manage_own'),
  }),
}))

builder.mutationFields((t) => ({
  createApiClient: t.field({
    type: ApiClientSecretPayload,
    description:
      'Owners only. Refusals: PLAN_REQUIRED, SCOPE_NOT_ALLOWED, LIMIT_REACHED, INVALID_INPUT.',
    args: { input: t.arg({ type: CreateApiClientInput, required: true }) },
    resolve: guarded('api_client.create'),
  }),
  rotateApiClientSecret: t.field({
    type: ApiClientSecretPayload,
    description: 'Owners only. The old secret keeps working for a short grace.',
    args: { id: t.arg.id({ required: true }) },
    resolve: guarded('api_client.create'),
  }),
  revokeApiClient: t.boolean({
    description:
      'Owners and operators. Immediate: bumps token_version, so outstanding access tokens fail on the next request.',
    args: { id: t.arg.id({ required: true }) },
    resolve: guarded('api_client.revoke'),
  }),
  createPersonalAccessToken: t.field({
    type: PersonalAccessTokenPayload,
    description:
      "Self-service. Scopes must fit the caller's current role and the org's plan. Refusals: PLAN_REQUIRED, SCOPE_NOT_ALLOWED, LIMIT_REACHED, INVALID_INPUT.",
    args: {
      input: t.arg({ type: CreatePersonalAccessTokenInput, required: true }),
    },
    resolve: guarded('pat.manage_own'),
  }),
  revokePersonalAccessToken: t.boolean({
    description: "Revokes one of the caller's own tokens. Immediate.",
    args: { id: t.arg.id({ required: true }) },
    resolve: guarded('pat.manage_own'),
  }),
}))
