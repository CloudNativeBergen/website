// Drizzle mirror of migrations/0001_init.sql, 0002_rollout_flags.sql,
// 0005_lifecycle_cancelled.sql and 0006_provisioning_conference.sql
// 0007_provisioning_created_by.sql, 0008_billing_plan.sql, 0010_org_kind.sql
// and 0011_billing_signup.sql.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull(),
  plan: text('plan', { enum: ['free', 'basic', 'pro'] }).notNull(),
  createdAt: text('created_at'),
  // Billing (#2129): tenancy's effectivePlan reads these.
  planSource: text('plan_source', { enum: ['stripe', 'comp', 'default'] })
    .notNull()
    .default('default'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status', {
    enum: ['active', 'past_due', 'canceled', 'incomplete'],
  }),
  currentPeriodEnd: text('current_period_end'),
  compUntil: text('comp_until'),
  compReason: text('comp_reason'),
  cancelAtPeriodEnd: integer('cancel_at_period_end', { mode: 'boolean' })
    .notNull()
    .default(false),
  // #2150: a demo org is Pro, unbilled, and mails only its members.
  kind: text('kind', { enum: ['customer', 'demo'] })
    .notNull()
    .default('customer'),
})

export const conferences = sqliteTable('conferences', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  lifecycle: text('lifecycle', {
    enum: ['draft', 'live', 'cancelled', 'archived'],
  }).notNull(),
  apiRead: integer('api_read', { mode: 'boolean' }).notNull().default(false),
  identityLogin: integer('identity_login', { mode: 'boolean' })
    .notNull()
    .default(false),
  d1Write: integer('d1_write', { mode: 'boolean' }).notNull().default(false),
  d1Override: integer('d1_override', { mode: 'boolean' })
    .notNull()
    .default(false),
})

export const domains = sqliteTable('domains', {
  hostname: text('hostname').primaryKey(),
  orgId: text('org_id').notNull(),
  conferenceId: text('conference_id').notNull(),
  kind: text('kind', {
    enum: ['platform-edition', 'platform-alias', 'custom'],
  }).notNull(),
  verification: text('verification', {
    enum: ['pending', 'verified', 'failed'],
  }).notNull(),
  cfCustomHostnameId: text('cf_custom_hostname_id'),
  /** Last Cloudflare status check, epoch ms. */
  checkedAt: integer('checked_at'),
})

export const provisioningRequests = sqliteTable('provisioning_requests', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  orgId: text('org_id').notNull(),
  // 0006 (#1957); null on rows written before it.
  conferenceId: text('conference_id'),
  // 0007 (kontroll#79): operator user id; null on older rows.
  createdBy: text('created_by'),
})

export const signupCodes = sqliteTable('signup_codes', {
  id: text('id').primaryKey(),
  codeHash: text('code_hash').notNull(),
  note: text('note').notNull(),
  maxUses: integer('max_uses').notNull(),
  uses: integer('uses').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
  revokedAt: text('revoked_at'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
})

export const inviteRequests = sqliteTable('invite_requests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  conference: text('conference').notNull(),
  size: text('size').notNull(),
  ticketed: integer('ticketed', { mode: 'boolean' }).notNull(),
  message: text('message'),
  status: text('status', {
    enum: ['new', 'invited', 'declined', 'spam'],
  })
    .notNull()
    .default('new'),
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
  codeId: text('code_id'),
})
