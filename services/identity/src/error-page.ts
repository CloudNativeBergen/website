// GET /error?error=<code>&origin=<site> (#1889). Better Auth sends OAuth
// failures here (onAPIError.errorURL, and the handoff's errorCallbackURL, which
// carries the site the login started from). `origin` is attacker-controlled:
// it becomes a link only after the same tenant-directory check /handoff uses.
import { createData, type DataEnv } from './data'

const GENERIC = 'Noe gikk galt under innloggingen. Prøv igjen.'
const MESSAGES: Record<string, string> = {
  state_mismatch:
    'Innloggingen ble avbrutt, ofte fordi den åpnet seg i en annen app eller nettleser. Prøv igjen i samme nettleser.',
  invalid_code: 'Innloggingen kunne ikke fullføres. Prøv igjen.',
  invalid_client:
    'Innloggingen virker ikke akkurat nå. Prøv igjen senere, eller kontakt arrangøren.',
  access_denied: 'Du avbrøt innloggingen. Prøv igjen hvis du vil logge inn.',
}

export async function errorPage(request: Request, env: DataEnv) {
  const url = new URL(request.url)
  const code = url.searchParams.get('error') ?? ''
  // Only fixed text reaches the page; the raw code is never echoed.
  const message = Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : GENERIC
  const origin = url.searchParams.get('origin') ?? ''
  // isVerifiedOrigin accepts only exactly `https://<hostname>`, so the href
  // holds no characters that need escaping.
  const retry = (await createData(env).isVerifiedOrigin(origin))
    ? `<a class="btn" href="${origin}/">Prøv igjen</a>`
    : '<p>Gå tilbake til konferansesiden og logg inn på nytt.</p>'
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  )
  const html = `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Innloggingen mislyktes</title>
<style nonce="${nonce}">
body{font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:2rem 1rem;line-height:1.5;color:#111;background:#fff}
@media (prefers-color-scheme:dark){body{color:#eee;background:#111}}
.btn{display:inline-block;padding:.75rem 1.5rem;border-radius:.5rem;background:#2563eb;color:#fff;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<main>
<h1>Innloggingen mislyktes</h1>
<p>${message}</p>
${retry}
</main>
</body>
</html>`
  return new Response(html, {
    status: 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': `default-src 'none'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      'x-content-type-options': 'nosniff',
    },
  })
}
