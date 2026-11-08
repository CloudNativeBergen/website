// tenant-directory: tenant resolution for the gateway, plus the provisioning
// surface. Provisioning fields are @tag(internal), except
// provisionOrganization and createOrganization (@tag(operator)); all need
// a PlatformContext.
// `organizations` (#1973) and `conferences` (#1985) are @tag(operator) too:
// requirePlatform.
// `organization` is public and returns only the envelope's own org.
import { createGraphQLError } from 'graphql-yoga'
import {
  PLANS,
  can,
  effectivePlan,
  graceUntil,
  parseOrgRoles,
  planAllows,
  principalOf,
  requirePlan,
  toOrgKind,
} from '@runkonf/tenancy'
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
  return can(principalOf(e), 'org.read_settings') ? e.orgId : null
}

const CreateOrganizationInput = builder.inputType('CreateOrganizationInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    slug: t.string({
      required: true,
      description: 'Lowercase a-z, 0-9 and -; becomes <slug>.konf.run.',
    }),
    conferenceTitle: t.string({ required: true }),
    startDate: t.string({ required: true, description: 'YYYY-MM-DD' }),
    endDate: t.string({
      required: true,
      description: 'YYYY-MM-DD, on or after startDate',
    }),
    domain: t.string({
      description: 'Optional custom hostname; proves itself by DNS later.',
    }),
    ownerEmail: t.string({
      required: true,
      description:
        'Becomes the first organizer (existing account or a new one).',
    }),
  }),
})

const CreatedOrganization = builder
  .objectRef<{ organizationId: string; conferenceId: string }>(
    'CreatedOrganization',
  )
  .implement({
    fields: (t) => ({
      organizationId: t.exposeID('organizationId'),
      conferenceId: t.exposeID('conferenceId'),
    }),
  })

const ProvisionConferenceInput = builder.inputType('ProvisionConferenceInput', {
  fields: (t) => ({
    title: t.string({ required: true }),
    startDate: t.string({ required: true, description: 'YYYY-MM-DD' }),
    endDate: t.string({
      required: true,
      description: 'YYYY-MM-DD, on or after startDate',
    }),
    domain: t.string({
      description: 'Optional custom hostname; proves itself by DNS later.',
    }),
    copyFrom: t.id({
      description:
        "An edition of the same org to clone the structure of. Without it the edition starts empty, with the org's identity (name, logo, theme) from its latest edition.",
    }),
  }),
})

const ProvisionedConference = builder
  .objectRef<{ conferenceId: string }>('ProvisionedConference')
  .implement({
    fields: (t) => ({ conferenceId: t.exposeID('conferenceId') }),
  })

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
      orgKind: t.string({
        nullable: true,
        description:
          "The owning org's kind, `customer` or `demo` (#2150); the site sets `robots: noindex` for `demo`. Null off the tenant lane: operators read `Organization.kind`.",
        // The reference resolver only returns the envelope's own org's
        // editions, so the envelope's minted kind is this edition's.
        resolve: (c, _, ctx) =>
          ctx.envelope?.typ === 'tenant' && ctx.envelope.orgId === c.orgId
            ? toOrgKind(ctx.envelope.orgKind)
            : null,
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
    return conf.lifecycle === 'live' ||
      can(principalOf(e), 'conference.read_draft')
      ? conf
      : null
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
      plan?: string
      orgKind?: string
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
      // The org's effective plan (#2129); only tenantByHost fills it.
      plan: t.string({
        nullable: true,
        tag: 'internal',
        resolve: (d) => d.plan ?? null,
      }),
      // `customer` or `demo` (#2150); only tenantByHost fills it.
      orgKind: t.string({
        nullable: true,
        tag: 'internal',
        resolve: (d) => d.orgKind ?? null,
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
  planSource?: string | null
  subscriptionStatus?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean | null
  compUntil?: string | null
  kind?: string | null
}

const billingRow = (o: OrgRow) => ({
  plan: o.plan,
  planSource: o.planSource ?? null,
  subscriptionStatus: o.subscriptionStatus ?? null,
  currentPeriodEnd: o.currentPeriodEnd ?? null,
  compUntil: o.compUntil ?? null,
  kind: o.kind ?? null,
})

// The org's billing state (#2129, docs/BILLING.md). Only through
// Organization.billing, which gates it.
const Billing = builder.objectRef<OrgRow>('Billing').implement({
  fields: (t) => ({
    plan: t.exposeString('plan', {
      description: 'The stored plan: `free`, `basic` or `pro`.',
    }),
    effectivePlan: t.string({
      description: 'The plan the platform enforces now.',
      resolve: (o) => effectivePlan(billingRow(o)),
    }),
    planSource: t.string({
      description: '`stripe`, `comp` or `default`.',
      resolve: (o) => o.planSource ?? 'default',
    }),
    subscriptionStatus: t.string({
      nullable: true,
      description:
        '`active`, `past_due`, `canceled` or `incomplete`; null without a subscription.',
      resolve: (o) => o.subscriptionStatus ?? null,
    }),
    currentPeriodEnd: t.string({
      nullable: true,
      description: 'ISO 8601.',
      resolve: (o) => o.currentPeriodEnd ?? null,
    }),
    cancelAtPeriodEnd: t.boolean({
      resolve: (o) => o.cancelAtPeriodEnd ?? false,
    }),
    compUntil: t.string({
      nullable: true,
      description: 'ISO 8601; null for no end or no grant.',
      resolve: (o) => o.compUntil ?? null,
    }),
    graceUntil: t.string({
      nullable: true,
      description:
        'While `past_due`: when the org drops to free (read-only), current_period_end + 14 days. ISO 8601; null otherwise.',
      resolve: (o) => graceUntil(billingRow(o)),
    }),
  }),
})

// After Domain: Organization.domains refers to it.
const Organization = builder.objectRef<OrgRow>('Organization').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    slug: t.exposeString('slug'),
    name: t.exposeString('name'),
    status: t.exposeString('status'),
    plan: t.exposeString('plan'),
    effectivePlan: t.string({
      description:
        'The plan the platform enforces now (#2129): `free`, `basic` or `pro`, from the plan, its source, the subscription status and the comp end date.',
      resolve: (o) =>
        effectivePlan({
          plan: o.plan,
          planSource: o.planSource ?? null,
          subscriptionStatus: o.subscriptionStatus ?? null,
          currentPeriodEnd: o.currentPeriodEnd ?? null,
          compUntil: o.compUntil ?? null,
          kind: o.kind ?? null,
        }),
    }),
    kind: t.string({
      description:
        '`customer` or `demo` (#2150). A demo org is Pro without billing and is left out of operator totals: filter on it.',
      resolve: (o) => toOrgKind(o.kind),
    }),
    billing: t.field({
      type: Billing,
      nullable: true,
      description:
        "The org's billing state (#2129). Owners and admins of this org on the tenant lane, or an operator acting for it; null for everyone else.",
      resolve: (o, _, ctx) => {
        const e = ctx.envelope
        return e?.typ === 'tenant' &&
          e.orgId === o.id &&
          can(principalOf(e), 'billing.read')
          ? o
          : null
      },
    }),
    // ISO 8601; null for orgs provisioned before #1973.
    createdAt: t.exposeString('createdAt', { nullable: true }),
    // Every hostname of this org, any verification state (#1969).
    domains: t.field({
      type: [Domain],
      resolve: (org, _, ctx) => ctx.data.domainsOf(org.id),
    }),
  }),
})

// An entity so identity can add memberCount and pendingInviteCount (#2142).
// Never resolved by reference here: an Organization only reaches identity
// from a field of this subgraph, and identity gates its own fields.
builder.asEntity(Organization, {
  key: builder.selection<{ id: string }>('id'),
  resolveReference: () => null,
})

// Per-conference counts for the operator lane (#2142). An entity keyed by the
// conference id: cfp, program, sponsors and ticketing each add their own count, gated on
// a PlatformContext. Integers only: no PII, no ids beyond the key.
const OperatorConferenceStats = builder
  .objectRef<{ conferenceId: string }>('OperatorConferenceStats')
  .implement({
    fields: (t) => ({
      conferenceId: t.exposeID('conferenceId'),
    }),
  })

builder.asEntity(OperatorConferenceStats, {
  key: builder.selection<{ conferenceId: string }>('conferenceId'),
  resolveReference: () => null,
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
      stats: t.field({
        type: OperatorConferenceStats,
        tag: 'operator',
        description:
          'Counts for this conference (#2142): proposals, confirmed speakers, sponsors, tickets sold. Platform operators only.',
        resolve: ({ conf }) => ({ conferenceId: conf.id }),
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

const PlanEnum = builder.enumType('Plan', { values: PLANS })

const LifecycleOverride = builder.enumType('ConferenceLifecycleOverride', {
  values: ['cancelled', 'archived'] as const,
})

const bad = (field: string, message: string) =>
  createGraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', reason: 'INVALID_INPUT', field },
  })

const notImplemented = (): never => {
  throw createGraphQLError('Not implemented yet', {
    extensions: { code: 'NOT_IMPLEMENTED' },
  })
}

const PaidPlan = builder.enumType('PaidPlan', {
  values: ['BASIC', 'PRO'] as const,
})
const Currency = builder.enumType('Currency', {
  values: ['EUR', 'USD', 'NOK'] as const,
})
const CheckoutSession = builder
  .objectRef<{ url: string }>('CheckoutSession')
  .implement({ fields: (t) => ({ url: t.exposeString('url') }) })
const BillingPortalSession = builder
  .objectRef<{ url: string }>('BillingPortalSession')
  .implement({ fields: (t) => ({ url: t.exposeString('url') }) })

/** Owner on the tenant lane with a signed-in user; guard before fetch. */
function requireBillingOwner(ctx: ResolverContext) {
  const e = ctx.envelope
  if (
    e?.typ !== 'tenant' ||
    !e.userId ||
    !can(principalOf(e), 'billing.manage')
  )
    throw createGraphQLError('billing is managed by the org owner', {
      extensions: { code: 'FORBIDDEN' },
    })
  return e
}

const SignupOrganizationInput = builder.inputType('SignupOrganizationInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    slug: t.string({
      required: true,
      description:
        'Lowercase a-z, 0-9 and -, 3 to 40 characters; becomes <slug>.konf.run.',
    }),
  }),
})
const SignupResult = builder
  .objectRef<{
    organization: OrgRow
    conference: Row<'id' | 'orgId' | 'lifecycle'>
    host: string
  }>('SignupResult')
  .implement({
    fields: (t) => ({
      organization: t.field({
        type: Organization,
        resolve: (r) => r.organization,
      }),
      conference: t.field({
        type: ConferenceEdition,
        resolve: (r) => r.conference,
      }),
      host: t.exposeString('host', {
        description: 'The closed-preview host, <slug>.konf.run.',
      }),
    }),
  })

type SignupCodeRow = {
  id: string
  note: string
  maxUses: number
  uses: number
  expiresAt: string
  revokedAt: string | null
  createdBy: string
  createdAt: string
  code?: string
}
const SignupCode = builder.objectRef<SignupCodeRow>('SignupCode').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    code: t.string({
      nullable: true,
      description:
        'The plain code: only in the createSignupCode result, never stored or shown again.',
      resolve: (c) => c.code ?? null,
    }),
    note: t.exposeString('note'),
    maxUses: t.exposeInt('maxUses'),
    uses: t.exposeInt('uses'),
    expiresAt: t.exposeString('expiresAt'),
    revokedAt: t.exposeString('revokedAt', { nullable: true }),
    createdBy: t.exposeID('createdBy'),
    createdAt: t.exposeString('createdAt'),
  }),
})

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
        return conf.lifecycle === 'draft' &&
          !can(principalOf(e), 'conference.read_draft')
          ? null
          : conf.lifecycle
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
    signupCodes: t.field({
      type: [SignupCode],
      tag: 'operator',
      description:
        'Every sign-up invite code, newest first, without the code itself. Platform operators only (operator lane, no tenant).',
      resolve: (_, __, ctx) => {
        requirePlatform(ctx)
        return ctx.data.signupCodes()
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
      resolve: async (_, { status }, ctx) => {
        const e = ctx.envelope
        // Guard before fetch: a refusal says nothing about the row.
        if (
          e?.typ !== 'tenant' ||
          !can(principalOf(e), 'conference.set_lifecycle')
        ) {
          throw createGraphQLError(
            'setting the lifecycle requires an org owner or admin',
            { extensions: { code: 'FORBIDDEN' } },
          )
        }
        if (!e.conferenceId) return null
        // Clearing the override puts a cancelled or archived edition back
        // live: a ticketed one needs a paid plan (#2129). No read on a paid
        // plan or for any other change.
        if (
          status == null &&
          !planAllows(e.plan, 'conference.publish_ticketed')
        ) {
          const conf = await ctx.data.conferenceOf(e.orgId, e.conferenceId)
          if (
            conf &&
            conf.lifecycle !== 'draft' &&
            conf.lifecycle !== 'live' &&
            (await ctx.data.ticketed(e.orgId, e.conferenceId))
          )
            requirePlan(e.plan, 'conference.publish_ticketed')
        }
        return ctx.data.setLifecycle(e.orgId, e.conferenceId, status ?? null)
      },
    }),
    provisionConference: t.field({
      type: ProvisionedConference,
      // kontroll#85. Public: the tenant lane is an org owner's or admin's.
      description:
        "Creates a new conference edition (draft) in an Organization: the Sanity document (through the site) and the directory row. Org owner or admin on the tenant lane, for the envelope's org; or a platform operator (operator lane, no tenant) naming `orgId`, which no other caller may pass. Retrying with the same idempotencyKey returns the same id.",
      args: {
        input: t.arg({ type: ProvisionConferenceInput, required: true }),
        idempotencyKey: t.arg.string({ required: true }),
        orgId: t.arg.id(),
      },
      resolve: (_, { input, idempotencyKey, orgId }, ctx) => {
        const e = ctx.envelope
        // Guard before fetch: nothing is read or written for a refusal.
        let org: string
        if (e?.typ === 'platform') {
          if (orgId == null)
            throw createGraphQLError('orgId is required on the operator lane', {
              extensions: {
                code: 'BAD_USER_INPUT',
                reason: 'INVALID_INPUT',
                field: 'orgId',
              },
            })
          org = String(orgId)
        } else {
          const roles = parseOrgRoles(e?.typ === 'tenant' ? e.orgRole : null)
          // Owner decision 3 (docs/AUTHORIZATION.md): lifecycle is the org
          // owner's or admin's, never a member's or a conference organizer's.
          // Not can(): the tenant lane's operator scope does not provision;
          // operators use the platform lane with an explicit orgId.
          if (
            e?.typ !== 'tenant' ||
            !e.userId ||
            orgId != null ||
            !(roles.has('owner') || roles.has('admin'))
          ) {
            throw createGraphQLError(
              'provisioning a conference requires an org owner or admin',
              { extensions: { code: 'FORBIDDEN' } },
            )
          }
          org = e.orgId
          // A custom domain is paid (#2129), checked on the envelope's plan
          // before any read. The operator lane is exempt: staff grant a
          // complimentary plan instead (setComplimentaryPlan).
          if (input.domain) requirePlan(e.plan, 'domain.connect_custom')
        }
        return ctx.data.provisionConference(
          org,
          {
            ...input,
            copyFrom: input.copyFrom == null ? null : String(input.copyFrom),
          },
          idempotencyKey,
          e.userId!,
        )
      },
    }),
    createOrganization: t.field({
      type: CreatedOrganization,
      // kontroll#79. requirePlatform first: nothing is read or written for
      // anyone but an operator on the platform lane.
      tag: 'operator',
      description:
        'Creates an Organization and its first Conference: the Sanity documents (through the site), the directory rows and the owner membership. Retrying with the same idempotencyKey returns the same ids. Platform operators only (operator lane, no tenant).',
      args: {
        input: t.arg({ type: CreateOrganizationInput, required: true }),
        idempotencyKey: t.arg.string({ required: true }),
      },
      resolve: (_, { input, idempotencyKey }, ctx) => {
        requirePlatform(ctx)
        const userId = (ctx.envelope as { userId: string }).userId
        return ctx.data.createOrganization(input, idempotencyKey, userId)
      },
    }),
    startCheckout: t.field({
      type: CheckoutSession,
      description:
        "Starts a Stripe Checkout session for a yearly plan for the envelope's org (#2129, docs/BILLING.md). Org owner only. Refused for a demo org and an org on an active complimentary plan.",
      args: {
        plan: t.arg({ type: PaidPlan, required: true }),
        currency: t.arg({ type: Currency, required: true }),
      },
      resolve: async (_, __, ctx) => {
        const e = requireBillingOwner(ctx)
        // Demo orgs are never billed; the envelope says so without a read.
        if (toOrgKind(e.orgKind) === 'demo')
          throw bad('organization', 'a demo organization is not billed')
        const org = await ctx.data.organization(e.orgId)
        if (
          org?.planSource === 'comp' &&
          (org.compUntil === null || Date.parse(org.compUntil) > Date.now())
        )
          throw bad(
            'organization',
            'this organization has a complimentary plan',
          )
        return notImplemented()
      },
    }),
    openBillingPortal: t.field({
      type: BillingPortalSession,
      description:
        "Opens the Stripe billing portal for the envelope's org (#2129). Org owner only.",
      resolve: (_, __, ctx) => {
        requireBillingOwner(ctx)
        return notImplemented()
      },
    }),
    signUpOrganization: t.field({
      type: SignupResult,
      description:
        'Self-serve sign-up in closed preview (#2129): creates an Organization (free, kind customer) with the caller as owner, its first draft edition and the host <slug>.konf.run, and spends one use of `inviteCode`. Returns after the owner membership is written, so `myOrganizations` sees it on the next request. Any signed-in user, on a session with no tenant; attempts are rate-limited per user (RATE_LIMITED). Refusals are BAD_USER_INPUT with `field` inviteCode, then slug, then name.',
      args: {
        input: t.arg({ type: SignupOrganizationInput, required: true }),
        inviteCode: t.arg.string({ required: true }),
      },
      resolve: async (_, { input, inviteCode }, ctx) => {
        const e = ctx.envelope
        // Guard before fetch: a browser session on the user lane only. Not
        // an operator (they use createOrganization), not a CLI token.
        if (e?.typ !== 'user' || !e.userId || e.cli)
          throw createGraphQLError(
            'signing up requires a signed-in session with no tenant',
            { extensions: { code: 'FORBIDDEN' } },
          )
        if (!(await ctx.data.signupAttempt(e.userId)))
          throw createGraphQLError('too many sign-up attempts', {
            extensions: { code: 'RATE_LIMITED' },
          })
        // The code first: without one, the slug check is no oracle (#2163).
        if (!(await ctx.data.signupCodeId(inviteCode)))
          throw bad('inviteCode', 'this invite code is not valid')
        const problem = await ctx.data.signupSlugProblem(input.slug)
        if (problem === 'format')
          throw bad(
            'slug',
            'slug must be 3 to 40 characters of a-z, 0-9 and -, not starting or ending with - and without --',
          )
        // Same message for reserved and taken; never repeats the slug.
        if (problem) throw bad('slug', 'this slug is not available')
        const name = input.name.trim()
        if (name.length < 2 || name.length > 80)
          throw bad('name', 'name must be 2 to 80 characters')
        const out = await ctx.data.signUp(
          e.userId,
          name,
          input.slug,
          inviteCode,
        )
        // Lost the race for the code's last use.
        if (!out) throw bad('inviteCode', 'this invite code is not valid')
        return out
      },
    }),
    createSignupCode: t.field({
      type: SignupCode,
      tag: 'operator',
      description:
        'Creates a sign-up invite code (#2129), valid until `expiresAt` (ISO 8601, in the future). The code is in this result only; just its hash is stored. Platform operators only (operator lane, no tenant).',
      args: {
        note: t.arg.string({ required: true }),
        maxUses: t.arg.int({ required: true }),
        expiresAt: t.arg.string({ required: true }),
      },
      resolve: (_, { note, maxUses, expiresAt }, ctx) => {
        requirePlatform(ctx)
        if (!note.trim() || note.length > 200)
          throw bad('note', 'note is required (at most 200 characters)')
        if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)
          throw bad('maxUses', 'maxUses must be 1 to 1000')
        const t = Date.parse(expiresAt)
        if (Number.isNaN(t) || t <= Date.now())
          throw bad('expiresAt', 'expiresAt must be a future ISO 8601 time')
        return ctx.data.createSignupCode(
          (ctx.envelope as { userId: string }).userId,
          note.trim(),
          maxUses,
          new Date(t).toISOString(),
        )
      },
    }),
    revokeSignupCode: t.field({
      type: SignupCode,
      nullable: true,
      tag: 'operator',
      description:
        'Revokes a sign-up invite code; null for an unknown id. Platform operators only (operator lane, no tenant).',
      args: { id: t.arg.id({ required: true }) },
      resolve: (_, { id }, ctx) => {
        requirePlatform(ctx)
        return ctx.data.revokeSignupCode(String(id))
      },
    }),
    setComplimentaryPlan: t.field({
      type: Organization,
      nullable: true,
      tag: 'operator',
      description:
        'Grants an Organization a plan without Stripe (#2129), until `until` (ISO 8601; omitted means no end), or ends a grant with `free`. Platform operators only (operator lane, no tenant); audited. Null for an unknown org.',
      args: {
        orgId: t.arg.id({ required: true }),
        plan: t.arg({ type: PlanEnum, required: true }),
        until: t.arg.string(),
        reason: t.arg.string({ required: true }),
      },
      resolve: (_, { orgId, plan, until, reason }, ctx) => {
        // Guard before fetch: nothing is read or written for anyone else.
        requirePlatform(ctx)
        const t = until == null ? null : Date.parse(until)
        if (t !== null && (Number.isNaN(t) || t <= Date.now()))
          throw bad('until', 'until must be a future ISO 8601 time')
        if (!reason.trim() || reason.length > 500)
          throw bad('reason', 'reason is required (at most 500 characters)')
        return ctx.data.setComplimentaryPlan(
          (ctx.envelope as { userId: string }).userId,
          String(orgId),
          plan,
          t === null ? null : new Date(t).toISOString(),
          reason.trim(),
        )
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
          createdBy: (ctx.envelope as { userId: string }).userId,
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
