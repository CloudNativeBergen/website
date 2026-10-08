/**
 * WorkOS redirect URIs over plain `fetch` (#1297). `@workos-inc/node` 10.13.0
 * has no method for `/user_management/redirect_uris`.
 *
 * WRITTEN FROM THE DOCUMENTATION
 * (https://workos.com/docs/reference/user-management/redirect-uri). The docs
 * give no status codes, no error bodies and no answer to "what happens when the
 * URI already exists", and they show the created object both bare and wrapped
 * in `redirect_uri`. So every answer is parsed defensively and anything this
 * cannot read is an error, never a guess.
 */

import { z } from 'zod'

const ENDPOINT = 'https://api.workos.com/user_management/redirect_uris'

/** The API's maximum; the default is 10. */
const PAGE_SIZE = 100
/** A ceiling on one listing, so a cursor that never ends cannot loop forever. */
const MAX_PAGES = 50
const TIMEOUT_MS = 10_000

export interface WorkOSRedirectUri {
  id: string
  uri: string
  /** When WorkOS says it was created; `null` when absent or not a date. */
  createdAt: Date | null
}

/**
 * A request that did not do what was asked.
 *
 * `status` is the HTTP status WorkOS answered with, and `null` when there was
 * no answer to go on — the request never completed, or it succeeded with a body
 * this could not read.
 */
export class WorkOSRedirectUriError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message)
    this.name = 'WorkOSRedirectUriError'
  }
}

const redirectUriSchema = z
  .object({
    id: z.string().min(1),
    uri: z.string().min(1),
    created_at: z.string().nullish(),
  })
  .transform(({ id, uri, created_at }): WorkOSRedirectUri => {
    const createdAt = created_at ? new Date(created_at) : null
    return {
      id,
      uri,
      createdAt:
        createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    }
  })

const listSchema = z.object({
  data: z.array(redirectUriSchema),
  list_metadata: z.object({ after: z.string().nullish() }).nullish(),
})

const createdSchema = z.union([
  redirectUriSchema,
  z
    .object({ redirect_uri: redirectUriSchema })
    .transform((v) => v.redirect_uri),
])

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<Response> {
  const apiKey = process.env.WORKOS_API_KEY?.trim()
  if (!apiKey) {
    throw new WorkOSRedirectUriError('WORKOS_API_KEY is not set', null)
  }
  try {
    return await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (error) {
    throw new WorkOSRedirectUriError(
      `${method} got no answer from WorkOS (${error instanceof Error ? error.name : 'unknown error'})`,
      null,
    )
  }
}

/** The refusal WorkOS answered with, as an error carrying its status. */
async function refusal(
  method: string,
  response: Response,
): Promise<WorkOSRedirectUriError> {
  // An unreadable error body adds nothing; the status is the fact.
  const parsed = z
    .object({ message: z.string() })
    .safeParse(await response.json().catch(() => undefined))
  const detail = parsed.success ? `: ${parsed.data.message.slice(0, 200)}` : ''
  return new WorkOSRedirectUriError(
    `${method} was refused by WorkOS with HTTP ${response.status}${detail}`,
    response.status,
  )
}

/** A 2xx body, read through `schema`; unreadable is an error without a status. */
async function readBody<T>(
  method: string,
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = schema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    throw new WorkOSRedirectUriError(
      `${method} succeeded but WorkOS answered in a shape this does not know`,
      null,
    )
  }
  return parsed.data
}

/** Every redirect URI in the environment, following the cursor to the end. */
export async function listRedirectUris(): Promise<WorkOSRedirectUri[]> {
  const all: WorkOSRedirectUri[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(ENDPOINT)
    url.searchParams.set('limit', String(PAGE_SIZE))
    url.searchParams.set('order', 'asc')
    if (after) url.searchParams.set('after', after)

    const response = await request('GET', url.toString())
    if (!response.ok) throw await refusal('GET', response)
    const body = await readBody('GET', response, listSchema)

    all.push(...body.data)
    const next = body.list_metadata?.after ?? null
    if (!next || body.data.length === 0) return all
    if (next === after) break
    after = next
  }
  throw new WorkOSRedirectUriError(
    'GET did not reach the end of the list; the cursor repeats or the list is longer than this reads',
    null,
  )
}

export async function createRedirectUri(
  uri: string,
): Promise<WorkOSRedirectUri> {
  const response = await request('POST', ENDPOINT, { uri })
  if (!response.ok) throw await refusal('POST', response)
  return readBody('POST', response, createdSchema)
}

/**
 * Delete by id. A 404 is an ERROR, not "already gone": until this has run
 * against the real API, a 404 could as well mean the path or the id is wrong,
 * and counting that as a delete would leave the URI in place unnoticed. The
 * caller only deletes ids it has just listed, and clears one that is gone on
 * its next listing.
 */
export async function deleteRedirectUri(id: string): Promise<void> {
  const response = await request(
    'DELETE',
    `${ENDPOINT}/${encodeURIComponent(id)}`,
  )
  if (!response.ok) throw await refusal('DELETE', response)
}
