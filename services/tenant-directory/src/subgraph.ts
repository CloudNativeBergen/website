// tenant-directory: tenant resolution for the gateway, plus the provisioning
// surface. Provisioning fields are @tag(internal), except
// provisionOrganization (@tag(operator)); all need a PlatformContext.
// `organizations` (#1973) is @tag(operator) too: requirePlatform.
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

// Contributes lifecycleStatus to the conference subgraph's editions (#1971).
// The source of truth for lifecycle is this D1.
const ConferenceEdition = builder
  .objectRef<Row<'id' | 'lifecycle'>>('ConferenceEdition')
  .implement({
    fields: (t) => ({
      id: t.exposeID('id'),
      lifecycleStatus: t.exposeString('lifecycle', {
        nullable: true,
        description:
          '`draft`, `live` or `archived`. Org members see every value; anyone else only `live`, and null otherwise.',
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

// After Domain: Organization.domains refers to it.
const Organization = builder
  .objectRef<
    Row<'id' | 'slug' | 'name' | 'status' | 'plan'> & {
      createdAt: string | null
    }
  >('Organization')
  .implement({
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

builder.queryType({
  fields: (t) => ({
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
