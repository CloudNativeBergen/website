// /invite/<id> (#2130): the invitee signs in and accepts an identity
// invitation. GET renders the page; POST accepts through Better Auth's
// acceptInvitation in-process, which checks that the invitation is pending
// and unexpired and that the session's VERIFIED email is the invited one.
// The HTTP route /api/auth/organization/accept-invitation stays behind the
// org-write gate: accepting is the invitee acting on their own invitation,
// served here, not an org write.
//
// Unknown, someone else's, expired and used invitations get the same answer,
// so a stranger learns nothing about an id.
import { createAuth, openInvitationFor, type AuthEnv } from './data'
import { esc, htmlResponse, page } from './account-page'

/** Where an accepted invitee lands: the org in Kontroll. */
export const KONTROLL_URL = 'https://my.konf.app'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const TITLE = 'Invitasjon'
const UNAVAILABLE =
  'Invitasjonen finnes ikke, er brukt, er utløpt eller gjelder en annen e-postadresse. Be om en ny invitasjon.'

const SCRIPT = `
const st = document.getElementById('status')
const fail = 'Noe gikk galt. Prøv igjen.'
for (const b of document.querySelectorAll('[data-signin]')) {
  b.addEventListener('click', async () => {
    const r = await fetch('/api/auth/sign-in/social', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: b.dataset.signin, callbackURL: location.pathname }),
    })
    const j = await r.json().catch(() => ({}))
    if (j.url) location.href = j.url
    else st.textContent = fail
  })
}
for (const b of document.querySelectorAll('[data-accept]')) {
  b.addEventListener('click', async () => {
    b.disabled = true
    const r = await fetch(location.pathname, { method: 'POST', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.url) location.href = j.url
    else { st.textContent = r.status === 404 ? ${JSON.stringify(UNAVAILABLE)} : fail; b.disabled = false }
  })
}
`

const PROVIDERS = { github: 'GitHub', linkedin: 'LinkedIn' }

interface InviteEnv extends AuthEnv {
  DB: D1Database
  /** The handoff's per-IP limiter, under its own key prefix. */
  HANDOFF_IP_LIMIT: RateLimit
}

const render = (body: string, status = 200) => {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  return htmlResponse(nonce, page(nonce, body, TITLE, SCRIPT), status)
}
const json = (body: unknown, status: number) => Response.json(body, { status })
const unavailable = () => json({ error: 'not_available' }, 404)

export async function invitePage(request: Request, env: InviteEnv) {
  const raw = new URL(request.url).pathname.slice('/invite/'.length)
  const id = ID.test(raw) ? raw : null
  const auth = createAuth(env.DB, env)

  if (request.method === 'POST') {
    // Better Auth checks origin on its own routes; this one is ours.
    if (request.headers.get('origin') !== new URL(env.BETTER_AUTH_URL).origin)
      return json({ error: 'forbidden' }, 403)
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!(await env.HANDOFF_IP_LIMIT.limit({ key: `invite:${ip}` })).success)
      return json({ error: 'rate_limited' }, 429)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return json({ error: 'unauthorized' }, 401)
    if (!id) return unavailable()
    try {
      const out = await auth.api.acceptInvitation({
        headers: request.headers,
        body: { invitationId: id },
      })
      const orgId = out?.invitation.organizationId
      if (!orgId) return unavailable()
      return json(
        { url: `${KONTROLL_URL}/orgs/${encodeURIComponent(orgId)}` },
        200,
      )
    } catch {
      // Mismatch, unverified, expired, unknown: one answer.
      return unavailable()
    }
  }

  if (request.method !== 'GET') return new Response(null, { status: 405 })
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return render(`<p>Logg inn med kontoen som har e-postadressen invitasjonen ble sendt til.</p>
${Object.entries(PROVIDERS)
  .map(
    ([p, name]) =>
      `<button class="btn" data-signin="${p}">Logg inn med ${name}</button>`,
  )
  .join('\n')}`)
  }
  const inv = id
    ? await openInvitationFor(env.DB, id, session.user.email)
    : null
  if (!inv) return render(`<p>${UNAVAILABLE}</p>`, 404)
  return render(`<p>Du er invitert til å bli med i <strong>${esc(inv.orgName)}</strong>.</p>
<button class="btn" data-accept>Godta invitasjonen</button>`)
}
