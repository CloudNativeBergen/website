// Preview-only manual login test page (GET /test). Served only when the plain
// var LOGIN_TEST_PAGE is "1", which service.cue sets for preview alone.
const SCRIPT = `
const $ = (id) => document.getElementById(id)
async function signIn(provider) {
  const r = await fetch('/api/auth/sign-in/social', {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, callbackURL: '/test' }),
  })
  const j = await r.json().catch(() => ({}))
  if (j.url) location.href = j.url
  else $('status').textContent = 'Sign-in failed: HTTP ' + r.status
}
async function load() {
  const r = await fetch('/api/auth/get-session', { credentials: 'include' })
  const s = r.ok ? await r.json().catch(() => null) : null
  if (!s || !s.user) { $('status').textContent = 'Not signed in'; $('out').hidden = true; return }
  const a = await fetch('/api/auth/list-accounts', { credentials: 'include' })
  const accts = a.ok ? await a.json().catch(() => []) : []
  $('status').textContent = 'Signed in'
  $('name').textContent = s.user.name || ''
  $('email').textContent = s.user.email || ''
  $('provider').textContent = Array.isArray(accts) ? accts.map((x) => x.providerId).join(', ') : ''
  $('expires').textContent = s.session && s.session.expiresAt || ''
  $('out').hidden = false
}
$('gh').addEventListener('click', () => signIn('github'))
$('li').addEventListener('click', () => signIn('linkedin'))
$('so').addEventListener('click', async () => {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json' }, body: '{}' })
  load()
})
load()
`

const HTML = (nonce: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Identity login test (preview)</title>
<style nonce="${nonce}">
body{font:18px system-ui,sans-serif;margin:0 auto;padding:1rem;max-width:32rem}
button{display:block;width:100%;font-size:1.2rem;padding:1rem;margin:.75rem 0;border-radius:.5rem}
dt{font-weight:600}dd{margin:0 0 .5rem;word-break:break-all}
</style></head><body>
<h1>Login test (preview)</h1>
<button id="gh">Sign in with GitHub</button>
<button id="li">Sign in with LinkedIn</button>
<h2>Session</h2>
<p id="status" role="status">Loading…</p>
<dl id="out" hidden><dt>Name</dt><dd id="name"></dd><dt>Email</dt><dd id="email"></dd>
<dt>Provider</dt><dd id="provider"></dd><dt>Session expires</dt><dd id="expires"></dd></dl>
<button id="so">Sign out</button>
<script nonce="${nonce}">${SCRIPT}</script>
</body></html>`

export function loginTestPage(): Response {
  const nonce = crypto.randomUUID().replaceAll('-', '')
  return new Response(HTML(nonce), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      'x-content-type-options': 'nosniff',
    },
  })
}
