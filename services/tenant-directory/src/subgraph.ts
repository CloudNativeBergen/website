// tenant-directory: tenant resolution for the gateway, plus the provisioning
// surface. Provisioning fields are @tag(internal), except
// provisionOrganization (@tag(operator)); all need a PlatformContext.
// `organizations` (#1973) and `conferences` (#1985) are @tag(operator) too:
// requirePlatform.
// `organization` is public and returns only the envelope's own org.
import { createGraphQLError } from 'graphql-yoga'
import { builder } from './builder'
import type { ResolverContext } from './worker'

const isPlatform = (ctx: ResolverContext) => ctx.envelope?.typ === 'platform'

function requirePlatform(ctx: ResolverContext) {
  if (!isPlatform(ctx)) {
    throw createGraphQLError('provisioning requires a PlatformContext', {
      extensions: { code: 'FORBIDDEN' },
    })
  }
}

/**
 * The session org for `organization` (#1968, #1969): the envelope's own org,
 * for a member with any role, or for an operator acting for it on the
 * operator lane (OPERATOR_SCOPE). Anyone else, anonymous callers included,
 * gets null. Never an argument, so no caller can name another org.
 */
function sessionOrgId(ctx: ResolverContext) {
  const e = ctx.envelope
  if (e?.typ !== 'tenant') return null
  return e.orgRole || e.scopes.includes('platform:operator') ? e.orgId : null
}

const ORGS_MAX = 100

type Row<K extends string> = Record<K, string>

const Conference = builder
  .objectRef<Row<'id' | 'orgId' | 'slug' | 'name' | 'lifecycle'>>('Conference')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      orgId: t.exposeID('orgId'),
      slug: t.exposeString('slug'),
      name: t.exposeString('name'),
      lifecycle: t.exposeString('lifecycle'),
    }),
  })

// Contributes lifecycleStatus (#1971) and primaryHost (#1977) to the
// conference subgraph's editions. Lifecycle and hostnames live in this D1.
const ConferenceEdition = builder
  .objectRef<Row<'id' | 'orgId' | 'lifecycle'>>('ConferenceEdition')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      lifecycleStatus: t.exposeString('lifecycle', {
        nullable: true,
        description:
          '`draft`, `live`, `cancelled` or `archived`. Org members see every value; anyone else only `live`, and null otherwise.',
      }),
      primaryHost: t.string({
        nullable: true,
        description:
          "The edition's canonical host: a verified custom domain, else its verified platform-edition host, else null. Never pending or failed. Same visibility as lifecycleStatus.",
        resolve: (c, _, ctx) => ctx.data.primaryHostOf(c.orgId, c.id),
      }),
    }),
  })

builder.asEntity(ConferenceEdition, {
  key: builder.selection<{ id: string }>('id'),
  // Only the envelope's own org's editions: an `_entities` call naming
  // another org's id gets null. Non-members (anonymous, operators acting
  // for the org) get `live` or nothing, never draft or archived.
  resolveReference: async ({ id }, ctx) => {
    const e = ctx.envelope
    if (e?.typ !== 'tenant') return null
    const conf = await ctx.data.conferenceOf(e.orgId, id)
    if (!conf) return null
    return e.orgRole || conf.lifecycle === 'live' ? conf : null
  },
})

type Flags = Record<
  'apiRead' | 'identityLogin' | 'd1Write' | 'd1Override',
  boolean
>

// Per-conference rollout flags (#1925). Read-only here: no mutation sets
// them; an operator writes the D1 columns.
const RolloutFlags = builder.objectRef<Flags>('RolloutFlags').implement({
  fields: (t) => ({
    apiRead: t.exposeBoolean('apiRead'),
    identityLogin: t.exposeBoolean('identityLogin'),
    d1Write: t.exposeBoolean('d1Write'),
    d1Override: t.exposeBoolean('d1Override'),
  }),
})

const Domain = builder
  .objectRef<
    Row<'hostname' | 'kind' | 'verification' | 'orgId' | 'conferenceId'> & {
      flags?: Flags
    }
  >('Domain')
  .implement({
    fields: (t) => ({
      // Only tenantByHost fills it; null from the provisioning mutations.
      flags: t.field({
        type: RolloutFlags,
        nullable: true,
        tag: 'internal',
        resolve: (d) => d.flags ?? null,
      }),
      hostname: t.exposeString('hostname'),
      kind: t.exposeString('kind'),
      verification: t.exposeString('verification'),
      orgId: t.exposeID('orgId'),
      conferenceId: t.exposeID('conferenceId'),
    }),
  })

type OrgRow = Row<'id' | 'slug' | 'name' | 'status' | 'plan'> & {
  createdAt: string | null
}

// After Domain: Organization.domains refers to it.
const Organization = builder.objectRef<OrgRow>('Organization').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    status: t.exposeString('status'),
    plan: t.exposeString('plan'),
    // ISO 8601; null for orgs provisioned before #1973.
    createdAt: t.exposeString('createdAt', { nullable: true }),
    // Every hostname of this org, any verification state (#1969).
    domains: t.field({
      type: [Domain],
      resolve: (org, _, ctx) => ctx.data.domainsOf(org.id),
    }),
  }),
})

const Lifecycle = builder.enumType('ConferenceLifecycle', {
  values: ['draft', 'live', 'cancelled', 'archived'] as const,
})
const FLAGS = ['apiRead', 'identityLogin', 'd1Write', 'd1Override'] as const
const RolloutFlag = builder.enumType('RolloutFlag', { values: FLAGS })

type ConfRow = Row<'id' | 'orgId' | 'lifecycle'> & Flags

// One row of the operator `conferences` list (#1985). Title, dates and
// dates come from the conference subgraph through `edition`.
const OperatorConference = builder
  .objectRef<{ conf: ConfRow; org: OrgRow }>('OperatorConference')
  .implement({
    fields: (t) => ({
      id: t.id({ resolve: ({ conf }) => conf.id }),
      organization: t.field({ type: Organization, resolve: ({ org }) => org }),
      lifecycleStatus: t.string({ resolve: ({ conf }) => conf.lifecycle }),
      flags: t.field({
        type: RolloutFlags,
        resolve: ({ conf }) =>
          Object.fromEntries(FLAGS.map((f) => [f, conf[f]])) as Flags,
      }),
      edition: t.field({
        type: ConferenceEdition,
        resolve: ({ conf }) => conf,
      }),
    }),
  })

// The caller's own orgs (#2036). Built only by myOrganizations, from the
// membership list identity returns for the envelope's userId.
const MyOrganization = builder
  .objectRef<{
    id: string
    name: string
    role: string
    editions: Row<'id' | 'orgId' | 'lifecycle'>[]
  }>('MyOrganization')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      name: t.exposeString('name'),
      role: t.exposeString('role'),
      conferenceEditions: t.field({
        type: [ConferenceEdition],
        resolve: (o) => o.editions,
      }),
    }),
  })

const LifecycleOverride = builder.enumType('ConferenceLifecycleOverride', {
  values: ['cancelled', 'archived'] as const,
})

const WRITERS = new Set(['owner', 'admin'])

builder.queryType({
  fields: (t) => ({
    conferenceLifecycle: t.string({
      nullable: true,
      description:
        "The request's Conference lifecycle: `live`, `cancelled` or `archived` for anyone, `draft` only for org members. Public because a cancelled or archived homepage says so to every visitor (#1997).",
      resolve: async (_, __, ctx) => {
        const e = ctx.envelope
        if (e?.typ !== 'tenant' || !e.conferenceId) return null
        const conf = await ctx.data.conferenceOf(e.orgId, e.conferenceId)
        if (!conf) return null
        return conf.lifecycle === 'draft' && !e.orgRole ? null : conf.lifecycle
      },
    }),
    organization: t.field({
      type: Organization,
      nullable: true,
      description:
        "The session's Organization: members (any role) and operators acting for it. Null for everyone else.",
      resolve: async (_, __, ctx) => {
        const id = sessionOrgId(ctx)
        return id ? ((await ctx.data.organization(id)) ?? null) : null
      },
    }),
    myOrganizations: t.field({
      type: [MyOrganization],
      description:
        "The signed-in user's own organizations, with their role and every conference edition (#2036). Kontroll's member lane: a session with no tenant. Refused with a tenant envelope or none.",
      resolve: (_, __, ctx) => {
        const e = ctx.envelope
        // Guard before fetch. A UserContext, or a PlatformContext for an
        // operator, who still gets only their own memberships: the userId
        // is the one the gateway verified, never an argument.
        if (e?.typ !== 'user' && e?.typ !== 'platform') {
          throw createGraphQLError(
            'myOrganizations requires a session with no tenant',
            { extensions: { code: 'FORBIDDEN' } },
          )
        }
        return ctx.data.myOrganizations(e.userId)
      },
    }),
    organizations: t.field({
      type: [Organization],
      tag: 'operator',
      description: `Every Organization, ordered by slug. Platform operators only (operator lane, no tenant). At most ${ORGS_MAX} per page: pass the last slug as \`after\` for the next.`,
      args: {
        first: t.arg.int({ defaultValue: ORGS_MAX }),
        after: t.arg.string(),
      },
      resolve: (_, { first, after }, ctx) => {
        // Guard before fetch: no D1 read for anyone else.
        requirePlatform(ctx)
        const n = Math.min(Math.max(first ?? ORGS_MAX, 1), ORGS_MAX)
        return ctx.data.organizations(n, after)
      },
    }),
    conferences: t.field({
      type: [OperatorConference],
      tag: 'operator',
      description: `Every org's conferences, ordered by id. Platform operators only (operator lane, no tenant). At most ${ORGS_MAX} per page: pass the last id as \`after\` for the next. \`lifecycle\` and \`flag\` (that flag on) filter.`,
      args: {
        first: t.arg.int({ defaultValue: ORGS_MAX }),
        after: t.arg.id(),
        lifecycle: t.arg({ type: Lifecycle }),
        flag: t.arg({ type: RolloutFlag }),
      },
      resolve: (_, { first, after, lifecycle, flag }, ctx) => {
        // Guard before fetch: no D1 read for anyone else.
        requirePlatform(ctx)
        const n = Math.min(Math.max(first ?? ORGS_MAX, 1), ORGS_MAX)
        return ctx.data.allConferences(
          n,
          after == null ? after : String(after),
          lifecycle,
          flag,
        )
      },
    }),
    tenantByHost: t.field({
      type: Domain,
      nullable: true,
      // Tenant resolution for the gateway and identity, which call it over
      // the DIRECTORY binding; never public, so no caller probes other
      // tenants' hostnames (#1787).
      tag: 'internal',
      description:
        'Resolves an Origin or hostname. Without a PlatformContext only a verified hostname of an active Organization resolves.',
      args: { host: t.arg.string({ required: true }) },
      resolve: (_, { host }, ctx) =>
        ctx.data.resolveHost(host, isPlatform(ctx)),
    }),
    conference: t.field({
      type: Conference,
      nullable: true,
      // The public `conference` belongs to content, then the conference
      // subgraph, and never takes an id from the caller (#1788, #1835).
      tag: 'internal',
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) =>
        ctx.data.conference(String(id), isPlatform(ctx)),
    }),
  }),
})

builder.mutationType({
  fields: (t) => ({
    setConferenceLifecycle: t.field({
      type: ConferenceEdition,
      nullable: true,
      description:
        "Sets the request's Conference homepage override, or clears it with null (back to `live`; a draft stays draft). Org owner or admin, or an operator acting for the org (#1997).",
      args: { status: t.arg({ type: LifecycleOverride }) },
      resolve: (_, { status }, ctx) => {
        const e = ctx.envelope
        const roles =
          e?.typ === 'tenant'
            ? (e.orgRole?.split(',').map((r) => r.trim()) ?? [])
            : []
        // Guard before fetch: a refusal says nothing about the row.
        if (
          e?.typ !== 'tenant' ||
          !e.userId ||
          !(
            e.scopes.includes('platform:operator') ||
            roles.some((r) => WRITERS.has(r))
          )
        ) {
          throw createGraphQLError(
            'setting the lifecycle requires an org owner or admin',
            { extensions: { code: 'FORBIDDEN' } },
          )
        }
        if (!e.conferenceId) return null
        return ctx.data.setLifecycle(e.orgId, e.conferenceId, status ?? null)
      },
    }),
    provisionOrganization: t.field({
      type: Organization,
      // In the public schema; requirePlatform refuses everyone but an operator.
      tag: 'operator',
      args: {
        idempotencyKey: t.arg.string({ required: true }),
        // Sanity `_id`s from the site's step 1 (docs/TENANT_PROVISIONING.md).
        orgId: t.arg.id({ required: true }),
        orgSlug: t.arg.string({ required: true }),
        conferenceId: t.arg.id({ required: true }),
      },
      resolve: (_, args, ctx) => {
        requirePlatform(ctx)
        return ctx.data.provision({
          ...args,
          orgId: String(args.orgId),
          conferenceId: String(args.conferenceId),
        })
      },
    }),
    repointAlias: t.field({
      type: Conference,
      tag: 'internal',
      args: { conferenceId: t.arg.id({ required: true }) },
      resolve: (_, { conferenceId }, ctx) => {
        requirePlatform(ctx)
        return ctx.data.repointAlias(String(conferenceId))
      },
    }),
    addCustomDomain: t.field({
      type: Domain,
      tag: 'internal',
      args: {
        conferenceId: t.arg.id({ required: true }),
        hostname: t.arg.string({ required: true }),
      },
      resolve: (_, { conferenceId, hostname }, ctx) => {
        requirePlatform(ctx)
        return ctx.data.addCustomDomain(String(conferenceId), hostname)
      },
    }),
    removeCustomDomain: t.field({
      type: Domain,
      tag: 'internal',
      args: { hostname: t.arg.string({ required: true }) },
      resolve: (_, { hostname }, ctx) => {
        requirePlatform(ctx)
        return ctx.data.removeCustomDomain(hostname)
      },
    }),
    refreshCustomDomain: t.field({
      type: Domain,
      tag: 'internal',
      args: { hostname: t.arg.string({ required: true }) },
      resolve: (_, { hostname }, ctx) => {
        requirePlatform(ctx)
        return ctx.data.refreshCustomDomain(hostname)
      },
    }),
  }),
})

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
})
