// Web push (kontroll#61): subscription mutations through the subgraph against
// a real D1 (Miniflare), the sender (encryption, VAPID, SSRF guard) and who
// gets each event.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSignature } from 'better-auth/crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import {
  ENVELOPE_HEADER,
  createSigner,
  generateEnvelopeKeyPair,
  type Envelope,
} from '@runkonf/tenancy'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createAuth, createData, type DataEnv } from './data'
import { notify, type PushEnv } from './data/push'
import { isAllowedPushEndpoint, sendWebPush } from './data/web-push'
import { Push } from './index'
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

const cf = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  pending: [] as Promise<unknown>[],
}))
vi.mock('cloudflare:workers', () => ({
  env: cf.env,
  waitUntil: (p: Promise<unknown>) => cf.pending.push(p),
  WorkerEntrypoint: class {
    env = cf.env
  },
}))

let mf: Miniflare
let d1: D1Database
let env: DataEnv
let vapid: Required<
  Pick<PushEnv, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>
>
let vapidPublic: CryptoKey

const b64u = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString(
    'base64url',
  )
const unb64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))

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
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  vapidPublic = kp.publicKey
  vapid = {
    VAPID_PUBLIC_KEY: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d!,
    VAPID_SUBJECT: 'mailto:hei@konf.app',
  }
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
  Object.assign(cf.env, env, vapid)
})
afterAll(() => mf?.dispose())

interface Sent {
  url: string
  init: RequestInit
}
let sent: Sent[]
let status: number
beforeEach(() => {
  sent = []
  status = 201
  cf.pending.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return new Response(null, { status })
    }),
  )
  return () => vi.unstubAllGlobals()
})
const flushed = async () => {
  // emit() loads cloudflare:workers lazily: let that import settle first.
  await new Promise((r) => setTimeout(r))
  await Promise.all(cf.pending)
  return sent
}

let n = 0
async function newUser() {
  const ctx = await (await auth()).$context
  const u = await ctx.internalAdapter.createUser(
    {
      email: `push-${++n}@example.com`,
      name: `User ${n}`,
      emailVerified: true,
    },
    { method: 'admin' },
  )
  return u.id
}
const auth = async () => createAuth(d1, env)
async function headers(userId: string) {
  const ctx = await (await auth()).$context
  const { token } = await ctx.internalAdapter.createSession(userId, false)
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return new Headers({
    cookie: `${ctx.authCookies.sessionToken.name}=${signed}`,
  })
}

const tenant = (userId: string | null): Envelope => ({
  typ: 'tenant',
  orgId: 'org-x',
  conferenceId: null,
  userId,
  orgRole: null,
  scopes: [],
})
const platform = (userId: string): Envelope => ({
  typ: 'platform',
  userId,
  platformRole: 'operator',
})

async function gql(
  envelope: Envelope | null,
  query: string,
  variables?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (envelope) headers[ENVELOPE_HEADER] = await signer.sign(envelope)
  const res = await graph.fetch(
    new Request('http://identity/graphql', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    }),
    { ...env, GATEWAY_PUBLIC_KEY: keys.publicPem },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary GraphQL JSON
  return (await res.json()) as any
}

const SUB =
  'mutation($input: PushSubscriptionInput!) { subscribePush(input: $input) }'
const UNSUB = 'mutation($e: String!) { unsubscribePush(endpoint: $e) }'
const P256DH = 'B'.repeat(87)
const AUTH = 'A'.repeat(22)
const FCM = 'https://fcm.googleapis.com/fcm/send/'
let e = 0
const endpoint = () => `${FCM}${++e}`
const input = (ep: string, p256dh = P256DH, a = AUTH) => ({
  input: { endpoint: ep, keys: { p256dh, auth: a } },
})
const rows = async (ep: string) =>
  (
    await d1
      .prepare(
        'SELECT id, user_id, p256dh FROM push_subscription WHERE endpoint = ?',
      )
      .bind(ep)
      .all<{ id: string; user_id: string; p256dh: string }>()
  ).results

/** A browser's subscription keys (RFC 8291 ua keys and auth secret). */
async function browserKeys() {
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  return { kp, pub, auth, p256dh: b64u(pub), authB64: b64u(auth) }
}

/** RFC 8291 §3.4 + RFC 8188, receiver side, in WebCrypto. */
async function decrypt(
  body: Uint8Array<ArrayBuffer>,
  k: Awaited<ReturnType<typeof browserKeys>>,
) {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPub = body.slice(21, 21 + idlen)
  const record = body.slice(21 + idlen)
  const shared = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: await crypto.subtle.importKey(
        'raw',
        asPub,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      ),
    },
    k.kp.privateKey,
    256,
  )
  const hkdf = async (
    s: BufferSource,
    ikm: BufferSource,
    info: BufferSource,
    len: number,
  ) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: s, info },
        await crypto.subtle.importKey('raw', ikm, 'HKDF', false, [
          'deriveBits',
        ]),
        len * 8,
      ),
    )
  const enc = (t: string) => new TextEncoder().encode(t)
  const ikm = await hkdf(
    k.auth,
    shared,
    new Uint8Array([...enc('WebPush: info\0'), ...k.pub, ...asPub]),
    32,
  )
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12)
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']),
      record,
    ),
  )
  const end = plain.lastIndexOf(2)
  expect(plain.slice(end + 1).every((b) => b === 0)).toBe(true)
  return JSON.parse(new TextDecoder().decode(plain.slice(0, end)))
}

describe('subscribePush / unsubscribePush', () => {
  it('stores the session user, never anyone else; anonymous is refused', async () => {
    const a = await newUser()
    const ep = endpoint()
    expect((await gql(tenant(a), SUB, input(ep))).errors).toBeUndefined()
    expect((await rows(ep)).map((r) => r.user_id)).toEqual([a])
    for (const env of [null, tenant(null)]) {
      const r = await gql(env, SUB, input(endpoint()))
      expect(r.errors[0].extensions.code).toBe('FORBIDDEN')
    }
    // There is no userId argument to name another user.
    const r = await gql(
      tenant(a),
      `mutation { subscribePush(userId: "x", input: {endpoint: "${FCM}x", keys: {p256dh: "B", auth: "A"}}) }`,
    )
    expect(r.errors[0].message).toMatch(/Unknown argument "userId"/)
  })

  it("takeover: another user's endpoint is deleted and re-inserted for the caller", async () => {
    const [a, b] = [await newUser(), await newUser()]
    const ep = endpoint()
    await gql(tenant(a), SUB, input(ep))
    const [before] = await rows(ep)
    await gql(platform(b), SUB, input(ep, 'C'.repeat(87)))
    const after = await rows(ep)
    expect(after).toEqual([
      { id: expect.any(String), user_id: b, p256dh: 'C'.repeat(87) },
    ])
    expect(after[0].id).not.toBe(before.id)
    // A cannot remove B's row by naming the endpoint.
    expect((await gql(tenant(a), UNSUB, { e: ep })).data.unsubscribePush).toBe(
      false,
    )
    expect(await rows(ep)).toHaveLength(1)
    expect((await gql(tenant(b), UNSUB, { e: ep })).data.unsubscribePush).toBe(
      true,
    )
    expect(await rows(ep)).toEqual([])
  })

  it.each([
    ['http endpoint', 'http://fcm.googleapis.com/x', P256DH, AUTH],
    ['not a URL', 'fcm.googleapis.com/x', P256DH, AUTH],
    ['userinfo', 'https://u:p@fcm.googleapis.com/x', P256DH, AUTH],
    ['unknown host', 'https://evil.com/x', P256DH, AUTH],
    ['IP literal', 'https://127.0.0.1/x', P256DH, AUTH],
    ['port 8443', 'https://fcm.googleapis.com:8443/x', P256DH, AUTH],
    ['long endpoint', `${FCM}${'x'.repeat(2048)}`, P256DH, AUTH],
    ['p256dh not base64url', `${FCM}v1`, 'a+b/', AUTH],
    ['p256dh too long', `${FCM}v2`, 'B'.repeat(129), AUTH],
    ['auth empty', `${FCM}v3`, P256DH, ''],
    ['auth too long', `${FCM}v4`, P256DH, 'A'.repeat(65)],
  ])('refuses %s and stores nothing', async (_, ep, p256dh, a) => {
    const r = await gql(tenant(await newUser()), SUB, input(ep, p256dh, a))
    expect(r.errors[0].extensions.code).toBe('BAD_USER_INPUT')
    expect(await rows(ep)).toEqual([])
  })
})

describe('SSRF guard', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:443/fcm/send/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x',
    'https://web.push.apple.com/x',
    'https://wns2-par02p.notify.windows.com/w/?token=x',
  ])('accepts %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true))

  it.each([
    'http://fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://evil.com/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilpush.apple.com/x',
    'https://push.apple.com.evil.com/x',
    'https://fcm.googleapis.com./x',
    'https://127.0.0.1/x',
    'https://0x7f.1/x',
    'https://[::1]/x',
    'https://u@fcm.googleapis.com/x',
    'not a url',
  ])('rejects %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false))

  const sub = { endpoint: `${FCM}g`, p256dh: '', auth: '' }
  beforeEach(async () => {
    const k = await browserKeys()
    sub.p256dh = k.p256dh
    sub.auth = k.authB64
  })
  const data = { title: 't', body: 'b', url: 'https://my.konf.app/' }

  it('never fetches a disallowed endpoint', async () => {
    for (const endpoint of ['https://evil.com/x', 'https://10.0.0.1/x'])
      expect(await sendWebPush(vapid, { ...sub, endpoint }, data)).toBe(
        'failed',
      )
    expect(sent).toEqual([])
  })

  it('does not follow redirects, treats 3xx as failure, and times out', async () => {
    status = 302
    expect(await sendWebPush(vapid, sub, data)).toBe('failed')
    expect(sent[0].init.redirect).toBe('manual')
    expect(sent[0].init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [201, 'ok'],
    [404, 'gone'],
    [410, 'gone'],
    [500, 'failed'],
  ])('status %i is %s', async (s, want) => {
    status = s
    expect(await sendWebPush(vapid, sub, data)).toBe(want)
  })
})

describe('encryption and VAPID', () => {
  it('the browser decrypts the aes128gcm body (RFC 8291 round trip)', async () => {
    const k = await browserKeys()
    const data = { title: 'Hi', body: 'There', url: 'https://my.konf.app/x' }
    await sendWebPush(
      vapid,
      { endpoint: `${FCM}r`, p256dh: k.p256dh, auth: k.authB64 },
      data,
    )
    const h = sent[0].init.headers as Record<string, string>
    expect(h['content-encoding']).toBe('aes128gcm')
    expect(
      await decrypt(sent[0].init.body as Uint8Array<ArrayBuffer>, k),
    ).toEqual(data)
    // Another browser's keys cannot open it.
    await expect(
      decrypt(
        sent[0].init.body as Uint8Array<ArrayBuffer>,
        await browserKeys(),
      ),
    ).rejects.toThrow()
  })

  it('signs an ES256 VAPID JWT for the push service origin', async () => {
    const k = await browserKeys()
    await sendWebPush(
      vapid,
      { endpoint: `${FCM}j`, p256dh: k.p256dh, auth: k.authB64 },
      { title: 't', body: 'b', url: 'u' },
    )
    const h = sent[0].init.headers as Record<string, string>
    const [, t, kk] = h.authorization.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(kk).toBe(vapid.VAPID_PUBLIC_KEY)
    const [hd, pl, sig] = t.split('.')
    expect(JSON.parse(Buffer.from(hd, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    })
    const claims = JSON.parse(Buffer.from(pl, 'base64url').toString())
    expect(claims).toMatchObject({
      aud: 'https://fcm.googleapis.com',
      sub: 'mailto:hei@konf.app',
    })
    const now = Date.now() / 1000
    expect(claims.exp).toBeGreaterThan(now)
    expect(claims.exp).toBeLessThanOrEqual(now + 24 * 3600)
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapidPublic,
      unb64u(sig),
      new TextEncoder().encode(`${hd}.${pl}`),
    )
    expect(ok).toBe(true)
  })
})

describe('recipients', () => {
  /** Every user gets one real subscription at FCM/<userId>. */
  async function subscribed(userId: string) {
    const k = await browserKeys()
    await gql(
      tenant(userId),
      SUB,
      input(`${FCM}${userId}`, k.p256dh, k.authB64),
    )
    return userId
  }
  const recipients = async () =>
    (await flushed()).map((s) => s.url.slice(FCM.length)).sort()
  async function org(...roles: string[]) {
    const orgId = `org-${++n}`
    await d1
      .prepare('INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)')
      .bind(orgId, `Org ${n}`, orgId)
      .run()
    const users: string[] = []
    for (const role of roles) {
      const u = await subscribed(await newUser())
      await d1
        .prepare(
          'INSERT INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, ?)',
        )
        .bind(`${orgId}-${u}`, orgId, u, role)
        .run()
      users.push(u)
    }
    return { orgId, users }
  }

  it('invite.accepted: owners and admins, not members, not the accepting user; role_changed: the affected user', async () => {
    const {
      orgId,
      users: [owner, admin],
    } = await org('owner', 'admin', 'member')
    const a = await auth()
    const ctx = await a.$context
    const invitee = await ctx.internalAdapter.createUser(
      { email: `inv-${orgId}@example.com`, name: 'Ivy', emailVerified: true },
      { method: 'admin' },
    )
    await subscribed(invitee.id)
    const inv = await a.api.createInvitation({
      headers: await headers(owner),
      body: { organizationId: orgId, email: invitee.email, role: 'admin' },
    })
    // member.invited is skipped.
    expect(await recipients()).toEqual([])
    await a.api.acceptInvitation({
      headers: await headers(invitee.id),
      body: { invitationId: inv.id },
    })
    expect(await recipients()).toEqual([owner, admin].sort())
    sent.length = 0
    await (
      await createData(env).members().asMember(owner, orgId)
    ).changeRole(invitee.id, 'member')
    expect(await recipients()).toEqual([invitee.id])
  })

  it('invite.accepted text names the user and the org, with a my.konf.app link', async () => {
    const {
      orgId,
      users: [owner],
    } = await org('owner')
    const k = await browserKeys()
    const ep = `${FCM}${owner}`
    await gql(tenant(owner), SUB, input(ep, k.p256dh, k.authB64))
    const u = await newUser()
    await notify(cf.env as unknown as PushEnv, {
      type: 'invite.accepted',
      organizationId: orgId,
      invitationId: 'i',
      userId: u,
    })
    const name = async (t: string, id: string) =>
      (await d1
        .prepare(`SELECT name FROM ${t} WHERE id = ?`)
        .bind(id)
        .first<{ name: string }>())!.name
    expect(
      await decrypt(sent[0].init.body as Uint8Array<ArrayBuffer>, k),
    ).toEqual({
      title: 'New member',
      body: `${await name('user', u)} joined ${await name('organization', orgId)}`,
      url: `https://my.konf.app/orgs/${orgId}/members`,
    })
  })

  it('member.role_changed never notifies an actor who changed their own role', async () => {
    const {
      orgId,
      users: [u],
    } = await org('owner')
    await notify(cf.env as unknown as PushEnv, {
      type: 'member.role_changed',
      organizationId: orgId,
      userId: u,
      role: 'admin',
      actorId: u,
    })
    expect(await recipients()).toEqual([])
  })

  it('conference.settings_changed: org members except the actor, via the Push entrypoint', async () => {
    const { orgId, users } = await org('owner', 'admin', 'member')
    await org('owner') // another org's member hears nothing
    await new Push({} as never, cf.env as never).send({
      type: 'conference.settings_changed',
      organizationId: orgId,
      conferenceId: 'c',
      conferenceName: 'Conf',
      actorId: users[1],
    })
    expect(await recipients()).toEqual([users[0], users[2]].sort())
  })

  it('the Push entrypoint refuses member events from conference', async () => {
    const {
      orgId,
      users: [u],
    } = await org('owner')
    await new Push({} as never, cf.env as never).send({
      type: 'member.role_changed',
      organizationId: orgId,
      userId: u,
      role: 'owner',
      actorId: null,
    } as never)
    expect(await recipients()).toEqual([])
  })

  it.each(['parity.drift', 'membership.drift'] as const)(
    '%s: platform operators only',
    async (type) => {
      const {
        orgId,
        users: [owner],
      } = await org('owner')
      const op = await subscribed(await newUser())
      await d1.prepare('UPDATE user SET platformOperator = 0').run()
      await d1
        .prepare('UPDATE user SET platformOperator = 1 WHERE id = ?')
        .bind(op)
        .run()
      await notify(
        cf.env as unknown as PushEnv,
        type === 'parity.drift'
          ? { type, conferenceIds: ['c'] }
          : { type, organizationId: orgId },
      )
      expect(await recipients()).toEqual([op])
      expect(owner).not.toBe(op)
    },
  )

  it('a 410 deletes the subscription; a 500 keeps it', async () => {
    const {
      orgId,
      users: [u],
    } = await org('owner')
    const ev = {
      type: 'member.role_changed' as const,
      organizationId: orgId,
      userId: u,
      role: 'admin',
      actorId: null,
    }
    status = 500
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await notify(cf.env as unknown as PushEnv, ev)
    expect(await rows(`${FCM}${u}`)).toHaveLength(1)
    status = 410
    await notify(cf.env as unknown as PushEnv, ev)
    expect(await rows(`${FCM}${u}`)).toEqual([])
    err.mockRestore()
  })

  it('a failed send never fails the mutation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {
      orgId,
      users: [owner, member],
    } = await org('owner', 'member')
    await (
      await createData(env).members().asMember(owner, orgId)
    ).changeRole(member, 'admin')
    await flushed()
    const row = await d1
      .prepare('SELECT role FROM member WHERE userId = ?')
      .bind(member)
      .first<{ role: string }>()
    expect(row?.role).toBe('admin')
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining('push.send_failed'),
    )
    err.mockRestore()
  })
})
