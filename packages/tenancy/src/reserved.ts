// The names the platform keeps for itself (#2129). ONE list: the site's
// platform-host minting (src/lib/domain-verification/platform.ts),
// tenant-directory's provisioning and self-serve sign-up all read it.
// Pure, no imports, so the site can load it by relative path.

/**
 * Labels the platform keeps for ITSELF, refused as a minted tenant address.
 *
 * Cheap to add now and impossible to add later: the claim is globally unique
 * and permanent, so the first tenant slugged `api` or `auth` would take
 * `api.<suffix>` off the platform for good — including the one host the central
 * auth origin (#688) is going to want. The list covers the conventional
 * infrastructure names (RFC 2142 mailbox names, the usual www/api/cdn shape),
 * the platform's own product surfaces and the environment names a deploy would
 * plausibly use.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // infrastructure / conventional hostnames
  'www',
  'api',
  'cdn',
  'static',
  'assets',
  'media',
  'img',
  'images',
  'files',
  'mail',
  'email',
  'smtp',
  'imap',
  'mx',
  'ns',
  'ns1',
  'ns2',
  'dns',
  'ftp',
  'vpn',
  'proxy',
  'edge',
  'origin',
  // platform surfaces
  'admin',
  'auth',
  'login',
  'signin',
  'signup',
  'account',
  'accounts',
  'app',
  'apps',
  'my',
  'dashboard',
  'console',
  'status',
  'health',
  'billing',
  'pay',
  'payments',
  'checkout',
  'docs',
  'doc',
  'blog',
  'help',
  'support',
  'kb',
  'go',
  'link',
  // brand / operations
  'konf',
  'runkonf',
  'platform',
  'internal',
  'security',
  'abuse',
  'postmaster',
  'webmaster',
  'hostmaster',
  'noreply',
  'no-reply',
  'root',
  'gateway',
  'kontroll',
  // id.konf.app is identity (#2163)
  'id',
  // environments
  'dev',
  'test',
  'stage',
  'staging',
  'preview',
  'demo',
  'sandbox',
  'beta',
  'alpha',
  'local',
  'localhost',
])

/** Org slug shape for self-serve sign-up: lowercase a-z, 0-9 and -, 3–40. */
export const SIGNUP_SLUG = /^[a-z0-9-]{3,40}$/

/**
 * Why a sign-up slug is unusable, before any lookup; null when it passes.
 * `xn--` (punycode) and `--` are refused: they make IDN lookalikes (#2163).
 */
export function signupSlugProblem(slug: string): 'format' | 'reserved' | null {
  if (
    !SIGNUP_SLUG.test(slug) ||
    slug.startsWith('-') ||
    slug.endsWith('-') ||
    slug.includes('--')
  )
    return 'format'
  return RESERVED_SLUGS.has(slug) ? 'reserved' : null
}
