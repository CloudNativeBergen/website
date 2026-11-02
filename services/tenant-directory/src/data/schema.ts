// Drizzle mirror of migrations/0001_init.sql.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull(),
  plan: text('plan').notNull(),
})

export const conferences = sqliteTable('conferences', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  lifecycle: text('lifecycle', {
    enum: ['draft', 'live', 'archived'],
  }).notNull(),
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
})

export const provisioningRequests = sqliteTable('provisioning_requests', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  orgId: text('org_id').notNull(),
})
