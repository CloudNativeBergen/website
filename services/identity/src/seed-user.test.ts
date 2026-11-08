// seedDemoUser (#2150) through the subgraph against a real D1 (Miniflare):
// demo-only, operator-only, seed email domains, and no login ever.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  ENVELOPE_HEADER,
  OPERATOR_SCOPE,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth } from './data/auth'
import type { DataEnv } from './data'
import graph from './worker'

// vitest.config.ts stubs `jose`; load the real one so envelopes verify.
vi.mock('jose', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  return import(pathToFileURL(require.resolve('jose')).href)
})
const keys = await generateEnvelopeKeyPair()
const signer = await createSigner(keys.privatePem)

let mf: Miniflare
let d1: D1Database
let env: DataEnv
const ORG = 'org-demo'

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      compatibilityDate: '2026-08-01',
      d1Databases: ['DB'],
    }),
  )
  d1 = (await mf.getD1Database('DB')) as unknown as D1Database
  const dir = join(import.meta.dirname, '../migrations')
  const sql = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join(';\n')
  for (const s of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim()))
    if (s) await d1.prepare(s).run()
  await d1
    .prepare(
      "INSERT INTO organization (id, name, slug) VALUES (?1, 'Demo', 'demo')",
    )
    .bind(ORG)
    .run()
  env = {
    DB: d1,
    DIRECTORY: {} as Fetcher,
    BETTER_AUTH_URL: 'http://identity.test',
    IDENTITY_ISSUER: 'https://id.test',
    BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
    GITHUB_CLIENT_ID: 'gh',
    GITHUB_CLIENT_SECRET: 'gh',
    LINKEDIN_CLIENT_ID: 'li',
    LINKEDIN_CLIENT_SECRET: 'li',
  } as DataEnv
})
afterAll(() => mf?.dispose())

const operatorFor = (
  orgKind: 'demo' | 'customer',
  scopes = [OPERATOR_SCOPE],
): Envelope => ({
  typ: 'tenant',
  orgId: ORG,
  conferenceId: null,
  userId: 'op-1',
  orgRole: null,
  scopes,
  plan: 'pro',
  orgKind,
})

async function seed(
  envelope: Envelope,
  vars: Record<string, unknown>,
): Promise<{ data?: { seedDemoUser: string | null }; errors?: unknown[] }> {
  const res = await graph.fetch(
    new Request('http://identity/graphql', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [ENVELOPE_HEADER]: await signer.sign(envelope),
      },
      body: JSON.stringify({
        query:
          'mutation($email: String!, $name: String!, $role: MemberRole, $profile: SpeakerProfileInput) { seedDemoUser(email: $email, name: $name, role: $role, profile: $profile) }',
        variables: vars,
      }),
    }),
    { ...env, GATEWAY_PUBLIC_KEY: keys.publicPem },
  )
  return res.json()
}

const users = async (email: string) =>
  (
    await d1
      .prepare('SELECT id, is_seed FROM user WHERE email = ?1')
      .bind(email)
      .all<{ id: string; is_seed: number }>()
  ).results
const code = (r: { errors?: unknown[] }) =>
  (r.errors?.[0] as { extensions?: { code?: string } })?.extensions?.code

describe('seedDemoUser guards', () => {
  it('a customer org is refused and nothing is written', async () => {
    const r = await seed(operatorFor('customer'), {
      email: 'a@example.com',
      name: 'A',
      role: 'member',
    })
    expect(code(r)).toBe('FORBIDDEN')
    expect(await users('a@example.com')).toEqual([])
  })

  it('a demo org member without the operator scope is refused', async () => {
    const r = await seed(operatorFor('demo', []), {
      email: 'b@example.com',
      name: 'B',
    })
    expect(code(r)).toBe('FORBIDDEN')
    expect(await users('b@example.com')).toEqual([])
  })

  it.each(['c@gmail.com', 'c@example.com.evil.no', 'c@test', 'nope'])(
    'refuses the address %s',
    async (email) => {
      const r = await seed(operatorFor('demo'), { email, name: 'C' })
      expect(code(r)).toBe('BAD_USER_INPUT')
      expect(await users(email)).toEqual([])
    },
  )

  it('never takes over a real user', async () => {
    await d1
      .prepare(
        "INSERT INTO user (id, name, email) VALUES ('real', 'R', 'r@kontainerkonf.test')",
      )
      .run()
    const r = await seed(operatorFor('demo'), {
      email: 'r@kontainerkonf.test',
      name: 'Taken',
      role: 'owner',
    })
    expect(code(r)).toBe('BAD_USER_INPUT')
    expect(await users('r@kontainerkonf.test')).toEqual([
      { id: 'real', is_seed: 0 },
    ])
  })
})

describe('seedDemoUser writes', () => {
  it('creates a seed member with a profile, audited, and converges on re-run', async () => {
    const vars = {
      email: 'Dana@Example.com',
      name: 'Dana',
      role: 'admin',
      profile: { name: 'Dana', bio: 'Demo', visibility: 'public' },
    }
    const first = await seed(operatorFor('demo'), vars)
    expect(first.errors).toBeUndefined()
    const again = await seed(operatorFor('demo'), { ...vars, role: 'member' })
    expect(again.data?.seedDemoUser).toBe(first.data?.seedDemoUser)
    const id = first.data!.seedDemoUser!
    expect(await users('dana@example.com')).toEqual([{ id, is_seed: 1 }])
    const m = await d1
      .prepare('SELECT role FROM member WHERE userId = ?1')
      .bind(id)
      .all()
    expect(m.results).toEqual([{ role: 'member' }])
    const p = await d1
      .prepare('SELECT bio FROM speaker_profile WHERE user_id = ?1')
      .bind(id)
      .first()
    expect(p).toEqual({ bio: 'Demo' })
    const a = await d1
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_event WHERE action = 'demo.seed_user' AND subject_user_id = ?1",
      )
      .bind(id)
      .first<{ n: number }>()
    expect(a?.n).toBe(2)
    const acc = await d1
      .prepare('SELECT COUNT(*) AS n FROM account WHERE userId = ?1')
      .bind(id)
      .first<{ n: number }>()
    expect(acc?.n).toBe(0)
  })
})

describe('a seed user can never log in', () => {
  const seeded = async (email: string) => {
    const r = await seed(operatorFor('demo'), {
      email,
      name: 'S',
      role: 'member',
    })
    return r.data!.seedDemoUser!
  }
  // The handoff (src/handoff.ts) and every OAuth callback end in
  // internalAdapter.createSession; a sign-in or link writes an account.
  const tryLogin = async (userId: string) => {
    const ctx = await createAuth(d1, env).$context
    const session = await ctx.internalAdapter.createSession(userId, false).then(
      () => 'created',
      (e: Error) => e.message,
    )
    const account = await ctx.internalAdapter
      .linkAccount({ userId, providerId: 'github', accountId: `gh-${userId}` })
      .then(
        () => 'created',
        (e: Error) => e.message,
      )
    return { session, account }
  }
  const sessions = async (userId: string) =>
    (
      await d1
        .prepare('SELECT COUNT(*) AS n FROM session WHERE userId = ?1')
        .bind(userId)
        .first<{ n: number }>()
    )?.n

  it('a real user does get a session (control)', async () => {
    await d1
      .prepare(
        "INSERT INTO user (id, name, email) VALUES ('ctl', 'C', 'ctl@example.com')",
      )
      .run()
    expect(await tryLogin('ctl')).toEqual({
      session: 'created',
      account: 'created',
    })
    expect(await sessions('ctl')).toBe(1)
  })

  it('refuses session and account for a seed user', async () => {
    const id = await seeded('nologin@example.com')
    const r = await tryLogin(id)
    expect(r.session).toMatch(/cannot sign in/)
    expect(r.account).toMatch(/cannot sign in/)
    expect(await sessions(id)).toBe(0)
  })

  it('still refuses after the org stops being a demo', async () => {
    const id = await seeded('flipped@example.com')
    // The org is now a customer: seeding is refused, login stays refused.
    const r = await seed(operatorFor('customer'), {
      email: 'flipped@example.com',
      name: 'S',
    })
    expect(code(r)).toBe('FORBIDDEN')
    expect((await tryLogin(id)).session).toMatch(/cannot sign in/)
    expect(await sessions(id)).toBe(0)
  })
})

describe('seedDemoInvitation (#2150)', () => {
  const invite = async (envelope: Envelope, vars: Record<string, unknown>) => {
    const res = await graph.fetch(
      new Request('http://identity/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [ENVELOPE_HEADER]: await signer.sign(envelope),
        },
        body: JSON.stringify({
          query:
            'mutation($email: String!, $role: MemberRole!, $status: SeedInvitationStatus!) { seedDemoInvitation(email: $email, role: $role, status: $status) { id status } }',
          variables: vars,
        }),
      }),
      // Mail is configured: only the code path decides whether it is sent.
      {
        ...env,
        RESEND_API_KEY: 're_test',
        INVITE_FROM: 'x@konf.test',
        GATEWAY_PUBLIC_KEY: keys.publicPem,
      },
    )
    return (await res.json()) as {
      data?: { seedDemoInvitation: { id: string; status: string } | null }
      errors?: unknown[]
    }
  }
  const rows = async (email: string) =>
    (
      await d1
        .prepare('SELECT status FROM invitation WHERE email = ?1')
        .bind(email)
        .all<{ status: string }>()
    ).results
  beforeAll(async () => {
    await d1
      .prepare(
        "INSERT OR IGNORE INTO user (id, name, email) VALUES ('op-1', 'Op', 'op@konf.test')",
      )
      .run()
  })

  it.each([
    ['a customer org', operatorFor('customer')],
    ['a demo member without the operator scope', operatorFor('demo', [])],
  ])('refuses %s and writes nothing', async (_, envelope) => {
    const r = await invite(envelope, {
      email: 'inv-x@example.com',
      role: 'member',
      status: 'accepted',
    })
    expect(code(r)).toBe('FORBIDDEN')
    expect(await rows('inv-x@example.com')).toEqual([])
  })

  it('refuses a real address', async () => {
    const r = await invite(operatorFor('demo'), {
      email: 'someone@gmail.com',
      role: 'member',
      status: 'pending',
    })
    expect(code(r)).toBe('BAD_USER_INPUT')
    expect(await rows('someone@gmail.com')).toEqual([])
  })

  it('writes every state without mailing, audited, and converges on re-run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      for (const status of ['pending', 'accepted', 'rejected', 'canceled']) {
        const vars = { email: 'Inv@Example.com', role: 'member', status }
        const first = await invite(operatorFor('demo'), vars)
        expect(first.data?.seedDemoInvitation?.status).toBe(status)
        const again = await invite(operatorFor('demo'), vars)
        expect(again.data?.seedDemoInvitation?.id).toBe(
          first.data?.seedDemoInvitation?.id,
        )
      }
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
    expect((await rows('inv@example.com')).map((r) => r.status).sort()).toEqual(
      ['accepted', 'canceled', 'pending', 'rejected'],
    )
    const a = await d1
      .prepare(
        "SELECT detail FROM audit_event WHERE action = 'demo.seed_invitation'",
      )
      .all<{ detail: string }>()
    expect(a.results).toHaveLength(4)
    expect(JSON.parse(a.results[0].detail)).toMatchObject({
      operator: true,
      orgId: ORG,
      delivery: 'skipped_demo',
    })
  })
})
