// POST /operator/cli-token: a short-lived operator-lane token for CLI scripts
// (`KONF_OPERATOR_TOKEN`, #2168). It is the gateway's existing identity JWT
// (EdDSA, aud konf-gateway, 300 s, `origin` claim) plus `cli: true`, so the
// gateway needs no change. Only a real session mints one: a JWT in the
// Authorization header is refused, so a CLI token cannot renew itself.
import { createAuth, createData } from './data'
import { JWT_TTL_SECONDS } from './data/auth'
import { isOperatorOrigin, type HandoffEnv } from './handoff'
import type { WorkerEnv } from './worker'

type Env = WorkerEnv & HandoffEnv

const noStore = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
}

/** One refusal for every caller who may not mint: no oracle. */
const refuse = () =>
  Response.json({ error: 'forbidden' }, { status: 403, headers: noStore })

export async function mintOperatorCliToken(request: Request, env: Env) {
  if (request.method !== 'POST')
    return new Response('Method not allowed', { status: 405 })
  // A JWT (three dot-separated parts) is never a session: a CLI token, or any
  // other identity JWT, cannot mint. Session bearers are `token.signature`.
  const bearer = /^Bearer +(\S+)$/i.exec(
    request.headers.get('authorization')?.trim() ?? '',
  )?.[1]
  if (bearer && bearer.split('.').length >= 3) return refuse()

  const auth = createAuth(env.DB, env)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return refuse()
  // The gateway's operator lane matches `origin` against an OPERATOR_ORIGIN
  // entry: a tenant-site session has nothing to mint for.
  const origin = (session.session as { origin?: string | null }).origin ?? ''
  if (!isOperatorOrigin(env, origin)) return refuse()
  // Live, from the DB: a cached claim would outlive a revoked operator.
  const data = createData(env)
  const principal = await data.principal(session.user.id, '')
  if (!principal?.platformOperator) return refuse()

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + JWT_TTL_SECONDS
  const jti = crypto.randomUUID()
  const { token } = await auth.api.signJWT({
    body: {
      payload: { sub: session.user.id, origin, cli: true, jti, iat, exp },
    },
  })
  // jti, expiry and actor only: never the token.
  await data.audit(
    'operator.cli_token.mint',
    session.user.id,
    origin,
    JSON.stringify({ jti, exp }),
  )
  return Response.json(
    { token, expiresAt: new Date(exp * 1000).toISOString(), origin },
    { headers: noStore },
  )
}
