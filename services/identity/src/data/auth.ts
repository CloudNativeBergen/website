// The Better Auth instance. Lives in the data layer because it holds the raw
// D1 handle; nothing outside src/data/ gets that handle back.
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt, oneTimeToken, organization } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'
import { rawDb } from './db'
import * as schema from './schema'

/** Per environment (`wrangler secret put`); preview never gets production values. */
export interface AuthEnv {
  BETTER_AUTH_URL: string
  /**
   * The identity JWT `iss`. Must equal the gateway's IDENTITY_ISSUER
   * (api/wrangler.jsonc): https://id.konf.app in production.
   */
  IDENTITY_ISSUER: string
  BETTER_AUTH_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  LINKEDIN_CLIENT_ID: string
  LINKEDIN_CLIENT_SECRET: string
}

/** Security requirement 4: identity JWTs live 5 minutes or less. */
export const JWT_TTL_SECONDS = 300
export const JWT_AUDIENCE = 'konf-gateway'

export function createAuth(d1: D1Database, env: AuthEnv) {
  const db = rawDb(d1)
  const audit = (action: string, userId: string, providerId?: string) =>
    db.insert(schema.auditEvent).values({ action, userId, providerId })

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    telemetry: { enabled: false },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      // Maps email_verified to emailVerified (false when absent), so an
      // unverified LinkedIn email never links (#807).
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
      },
    },
    account: {
      // #807: a sign-in joins an existing user on its provider account id, or
      // on an email both the provider and our record hold as verified. No
      // provider is trusted to skip that check.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        requireLocalEmailVerified: true,
        allowDifferentEmails: false,
      },
    },
    user: {
      additionalFields: {
        platformOperator: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      account: {
        create: {
          after: async (a) => {
            // First account of a user is a sign-up; any later one is a link.
            const [{ n }] = await db
              .select({ n: count() })
              .from(schema.account)
              .where(eq(schema.account.userId, a.userId))
            const action = n > 1 ? 'account.linked' : 'account.created'
            await audit(action, a.userId, a.providerId)
          },
        },
      },
      session: {
        create: {
          after: async (s) => {
            await audit('session.created', s.userId)
          },
        },
      },
    },
    plugins: [
      jwt({
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
        jwt: {
          issuer: env.IDENTITY_ISSUER,
          audience: JWT_AUDIENCE,
          expirationTime: `${JWT_TTL_SECONDS}s`,
          // sub (the user id) only. orgRole and the operator flag come from
          // the live lookup on every request, never from a token claim.
          definePayload: () => ({}),
        },
      }),
      // Organizations are provisioned by operators through the directory,
      // not created by users.
      organization({
        allowUserToCreateOrganization: false,
        requireEmailVerificationOnInvitation: true,
        disableOrganizationDeletion: true,
        organizationHooks: {
          // Slug and name mirror tenant-directory, which owns them.
          beforeUpdateOrganization: async ({ organization: o }) => {
            if (o.slug !== undefined || o.name !== undefined) {
              throw new APIError('FORBIDDEN', {
                message: 'Slug and name are managed by tenant-directory',
              })
            }
          },
        },
      }),
      // Login handoff (#1803 wires it up): single use, one minute, hashed.
      oneTimeToken({
        expiresIn: 1,
        storeToken: 'hashed',
        disableClientRequest: true,
      }),
    ],
  })
}
