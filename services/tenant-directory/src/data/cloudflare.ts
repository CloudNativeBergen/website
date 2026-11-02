// Cloudflare for SaaS custom hostnames: Cloudflare owns validation and the
// certificate; the directory mirrors the resulting status.
export type Verification = 'pending' | 'verified' | 'failed'

export interface CustomHostnames {
  create(hostname: string): Promise<{ id: string; verification: Verification }>
  get(id: string): Promise<Verification>
  delete(id: string): Promise<void>
  /** An existing custom hostname for `hostname`, if Cloudflare has one. */
  find(
    hostname: string,
  ): Promise<{ id: string; verification: Verification } | null>
}

export interface CloudflareEnv {
  /** Zone-scoped token with SSL and Certificates: Edit. */
  CF_API_TOKEN: string
  /** The SaaS zone custom hostnames CNAME to. */
  CF_ZONE_ID: string
}

interface CfHostname {
  id: string
  status: string
  ssl?: { status?: string }
}

const FAILED = new Set(['blocked', 'moved', 'deleted', 'pending_deletion'])

function verification(h: CfHostname): Verification {
  if (h.status === 'active' && h.ssl?.status === 'active') return 'verified'
  return FAILED.has(h.status) ? 'failed' : 'pending'
}

export function cloudflareHostnames(env: CloudflareEnv): CustomHostnames {
  const base = `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames`
  async function call<T = CfHostname>(
    url: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${env.CF_API_TOKEN}`,
        'content-type': 'application/json',
      },
    })
    // A non-JSON body (an HTML error page) still reports its HTTP status.
    const body = (await res.json().catch(() => null)) as {
      success?: boolean
      result: T
    } | null
    if (!res.ok || !body?.success) {
      throw new Error(`cloudflare custom hostnames: HTTP ${res.status}`)
    }
    return body.result
  }
  return {
    async create(hostname) {
      const h = await call(base, {
        method: 'POST',
        body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }),
      })
      return { id: h.id, verification: verification(h) }
    },
    async get(id) {
      return verification(await call(`${base}/${id}`))
    },
    async find(hostname) {
      const [h] = await call<CfHostname[]>(
        `${base}?hostname=${encodeURIComponent(hostname)}`,
      )
      return h ? { id: h.id, verification: verification(h) } : null
    },
    async delete(id) {
      await call(`${base}/${id}`, { method: 'DELETE' })
    },
  }
}
