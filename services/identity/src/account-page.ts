// GET /account (#1981): the signed-in user's linked sign-in accounts. Linking
// and unlinking go through Better Auth's own /link-social and /unlink-account
// from this page, so they get the same origin and CSRF checks as every other
// /api/auth route. The linking rules live in src/data/auth.ts.
import { createAuth, type AuthEnv } from './data'

const PROVIDERS: Record<string, string> = {
  github: 'GitHub',
  linkedin: 'LinkedIn',
}

// Link failures come back as ?error=<code>. Only fixed text reaches the page.
const ERRORS: Record<string, string> = {
  email_does_not_match:
    'Kontoen har en annen e-postadresse enn din. Du kan bare koble til kontoer med samme e-postadresse.',
  account_already_linked_to_different_user:
    'Kontoen er allerede koblet til en annen bruker.',
  unable_to_link_account:
    'Kontoen kunne ikke kobles til. E-postadressen må være bekreftet hos tjenesten.',
}
const GENERIC_ERROR = 'Noe gikk galt. Prøv igjen.'

const SCRIPT = `
const st = document.getElementById('status')
async function post(path, body) {
  const r = await fetch('/api/auth/' + path, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}
for (const b of document.querySelectorAll('[data-link]')) {
  b.addEventListener('click', async () => {
    const { j } = await post('link-social', {
      provider: b.dataset.link, callbackURL: '/account', errorCallbackURL: '/account',
    })
    if (j.url) location.href = j.url
    else st.textContent = ${JSON.stringify(GENERIC_ERROR)}
  })
}
for (const b of document.querySelectorAll('[data-unlink]')) {
  b.addEventListener('click', async () => {
    const { ok } = await post('unlink-account', { accountId: b.dataset.unlink })
    if (ok) location.replace('/account')
    else st.textContent = 'Kontoen kunne ikke kobles fra. Logg inn på nytt og prøv igjen.'
  })
}
for (const b of document.querySelectorAll('[data-signin]')) {
  b.addEventListener('click', async () => {
    const { j } = await post('sign-in/social', { provider: b.dataset.signin, callbackURL: '/account' })
    if (j.url) location.href = j.url
    else st.textContent = ${JSON.stringify(GENERIC_ERROR)}
  })
}
`

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function page(nonce: string, body: string) {
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Innloggingskontoer</title>
<style nonce="${nonce}">
body{font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem 1rem;line-height:1.5;color:#111;background:#fff}
@media (prefers-color-scheme:dark){body{color:#eee;background:#111}}
ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.75rem 0;border-bottom:1px solid #8884}
.btn{display:inline-block;padding:.75rem 1.5rem;margin:.25rem 0;border:0;border-radius:.5rem;background:#2563eb;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.sec{background:transparent;color:inherit;border:1px solid #8888;padding:.5rem 1rem}
.note{color:#666}@media (prefers-color-scheme:dark){.note{color:#aaa}}
</style>
</head>
<body>
<main>
<h1>Innloggingskontoer</h1>
${body}
<p id="status" role="status"></p>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`
}

export async function accountPage(
  request: Request,
  env: { DB: D1Database } & AuthEnv,
) {
  const auth = createAuth(env.DB, env)
  const session = await auth.api.getSession({ headers: request.headers })
  const code = new URL(request.url).searchParams.get('error')
  const error = code
    ? `<p role="alert">${Object.hasOwn(ERRORS, code) ? ERRORS[code] : GENERIC_ERROR}</p>`
    : ''
  let body: string
  if (!session) {
    body = `<p>Logg inn for å se hvilke kontoer du kan logge inn med.</p>
${Object.entries(PROVIDERS)
  .map(
    ([id, name]) =>
      `<button class="btn" data-signin="${id}">Logg inn med ${name}</button>`,
  )
  .join('\n')}`
  } else {
    const accounts = (
      await auth.api.listUserAccounts({ headers: request.headers })
    ).filter((a) => Object.hasOwn(PROVIDERS, a.providerId))
    const linked = new Set(accounts.map((a) => a.providerId))
    const last = accounts.length <= 1
    body = `<p>Du kan logge inn på alle konf-tjenester med hvilken som helst av disse kontoene.</p>
${error}
<ul>
${accounts
  .map(
    (a) =>
      `<li><span>${PROVIDERS[a.providerId]}</span>${
        last
          ? '<span class="note">Siste konto, kan ikke kobles fra</span>'
          : `<button class="btn sec" data-unlink="${esc(a.id)}">Koble fra</button>`
      }</li>`,
  )
  .join('\n')}
</ul>
${Object.entries(PROVIDERS)
  .filter(([id]) => !linked.has(id))
  .map(
    ([id, name]) =>
      `<button class="btn" data-link="${id}">Koble til ${name}</button>`,
  )
  .join('\n')}`
  }
  const nonce = crypto.randomUUID().replaceAll('-', '')
  return new Response(page(nonce, body), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      'x-content-type-options': 'nosniff',
    },
  })
}
