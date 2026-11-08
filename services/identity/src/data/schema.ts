// Better Auth's tables (core, jwt, organization) plus the audit table.
// Mirrors migrations/0001_init.sql. Identity is tenancy-exempt: a user,
// session or membership is not owned by one Organization.
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  uniqueIndex,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

const now = () =>
  integer({ mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
const date = () => integer({ mode: 'timestamp_ms' })
const flag = () => integer({ mode: 'boolean' })

export const user = sqliteTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: flag().notNull().default(false),
  image: text(),
  // Entitles the gateway to mint Platform context. Never user-settable
  // (input: false in auth.ts); set by the documented operator procedure.
  platformOperator: flag().notNull().default(false),
  createdAt: now(),
  updatedAt: now(),
})

export const session = sqliteTable(
  'session',
  {
    id: text().primaryKey(),
    expiresAt: date().notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text(),
    // The tenant origin the handoff issued this session for (#1803).
    origin: text(),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: date(),
    refreshTokenExpiresAt: date(),
    scope: text(),
    password: text(),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: date().notNull(),
    createdAt: now(),
    updatedAt: now(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

export const jwks = sqliteTable('jwks', {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  alg: text(),
  crv: text(),
  createdAt: now(),
  expiresAt: date(),
})

export const organization = sqliteTable('organization', {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  logo: text(),
  metadata: text(),
  createdAt: now(),
})

export const member = sqliteTable(
  'member',
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text().notNull(),
    createdAt: now(),
  },
  (t) => [uniqueIndex('member_user_org_idx').on(t.userId, t.organizationId)],
)

export const invitation = sqliteTable(
  'invitation',
  {
    id: text().primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    role: text(),
    status: text().notNull(),
    expiresAt: date().notNull(),
    inviterId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: now(),
  },
  (t) => [index('invitation_email_idx').on(t.email)],
)

// Ids only, never emails or names (#1310): erasing a user leaves rows that
// point at a deleted id and say nothing about the person.
export const auditEvent = sqliteTable('audit_event', {
  id: integer().primaryKey({ autoIncrement: true }),
  at: now(),
  action: text().notNull(),
  userId: text().notNull(),
  // The provider id for account.linked; null otherwise.
  providerId: text(),
  // Handoff rows: the tenant origin and the upgrade match type.
  origin: text(),
  detail: text(),
  // The user the action was done to (revokeAll, operator member writes).
  subjectUserId: text('subject_user_id'),
})
