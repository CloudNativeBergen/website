/**
 * Exercise WorkOS's redirect-URI API for real and print what it answers.
 *
 *   WORKOS_API_KEY=sk_test_… pnpm tsx scripts/probe-workos-redirect-uris.ts
 *
 * WHY. `src/lib/workshop/redirect-uris/client.ts` was written from the
 * documentation, which states no status codes, no error bodies and no answer to
 * "what happens when the URI already exists". This prints those facts for a
 * STAGING environment, and then runs the same calls through the client to show
 * it reads them. Paste the output into the PR as the evidence #1297 asks for.
 *
 * It touches WorkOS only — no Sanity read or write. It creates one URI on a
 * host nobody will ever sign in on (`redirect-uri-probe-<time>.example.org`)
 * and, at the end, lists the environment and deletes every entry with that
 * URI, whatever happened in between. If any is still there it says so and
 * exits non-zero. It refuses a key that is not `sk_test_…` unless
 * `--allow-live`.
 */
import {
  createRedirectUri,
  deleteRedirectUri,
  listRedirectUris,
} from '../src/lib/workshop/redirect-uris/client'

const ENDPOINT = 'https://api.workos.com/user_management/redirect_uris'

const apiKey = process.env.WORKOS_API_KEY?.trim() ?? ''
if (!apiKey) {
  console.error('WORKOS_API_KEY is not set.')
  process.exit(1)
}
if (!apiKey.startsWith('sk_test_') && !process.argv.includes('--allow-live')) {
  console.error(
    'WORKOS_API_KEY is not a staging key (sk_test_…). Pass --allow-live to run against it anyway.',
  )
  process.exit(1)
}

interface Answer {
  status: number
  body: unknown
}

async function call(
  label: string,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<Answer> {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  console.log(`\n### ${label}`)
  console.log(`${method} ${url.replace(ENDPOINT, '…/redirect_uris')}`)
  console.log(`HTTP ${response.status}`)
  console.log(text || '(empty body)')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  return { status: response.status, body: parsed }
}

function idOf(body: unknown): string | undefined {
  const top = body as { id?: string; redirect_uri?: { id?: string } } | null
  return top?.id ?? top?.redirect_uri?.id
}

function firstIdOf(body: unknown): string | undefined {
  return (body as { data?: { id?: string }[] } | null)?.data?.[0]?.id
}

/**
 * Delete every entry with the probe's URI, found by LISTING — so it does not
 * depend on having read an id out of a create answer. Returns what is left.
 */
async function removeProbeUris(uri: string): Promise<string[]> {
  // By host, which is unique to this run: WorkOS may spell the URI its own way.
  const { host } = new URL(uri)
  const isMine = (entry: { uri: string }) =>
    URL.canParse(entry.uri) && new URL(entry.uri).host === host
  for (const entry of (await listRedirectUris()).filter(isMine)) {
    await call('Clean up', 'DELETE', `${ENDPOINT}/${entry.id}`)
  }
  return (await listRedirectUris()).filter(isMine).map((entry) => entry.id)
}

async function main(): Promise<void> {
  const uri = `https://redirect-uri-probe-${Date.now()}.example.org/api/auth/callback`
  let failure: unknown

  try {
    const first = await call(
      'List, one per page, oldest first',
      'GET',
      `${ENDPOINT}?limit=1&order=asc`,
    )
    const after = (
      first.body as { list_metadata?: { after?: string | null } } | null
    )?.list_metadata?.after
    if (after) {
      const second = await call(
        'List, the page after that cursor',
        'GET',
        `${ENDPOINT}?limit=1&order=asc&after=${encodeURIComponent(after)}`,
      )
      console.log(
        `\nThe second page starts with a different entry: ${firstIdOf(second.body) !== firstIdOf(first.body)}`,
      )
    } else {
      console.log('\n(no `after` cursor: the environment has at most one URI)')
    }

    const created = await call('Create', 'POST', ENDPOINT, { uri })
    const createdId = idOf(created.body)
    const again = await call('Create the same URI again', 'POST', ENDPOINT, {
      uri,
    })
    console.log(
      `\nThe second create answered with the first entry's id: ${createdId !== undefined && idOf(again.body) === createdId}`,
    )
    if (createdId) {
      await call('Delete', 'DELETE', `${ENDPOINT}/${createdId}`)
      await call('Delete it again', 'DELETE', `${ENDPOINT}/${createdId}`)
    } else {
      console.log('\n(no id could be read from the create answer)')
    }
    // A duplicate WorkOS accepted, or a delete it refused, is still there.
    await removeProbeUris(uri)

    console.log('\n### The same round trip through the client')
    const before = await listRedirectUris()
    console.log(`listRedirectUris(): ${before.length} URIs`)
    const viaClient = await createRedirectUri(uri)
    console.log('createRedirectUri():', viaClient)
    const listed = (await listRedirectUris()).find((u) => u.id === viaClient.id)
    console.log('…as the list returns it:', listed)
    await deleteRedirectUri(viaClient.id)
    console.log('deleteRedirectUri(): ok')
    const gone = !(await listRedirectUris()).some((u) => u.id === viaClient.id)
    console.log(`gone from the list: ${gone}`)
  } catch (error) {
    failure = error
  }

  try {
    const left = await removeProbeUris(uri)
    if (left.length > 0) {
      console.error(
        `\nSTILL REGISTERED: ${uri} (${left.join(', ')}). Remove it in the WorkOS dashboard.`,
      )
      process.exitCode = 1
    } else {
      console.log('\nNothing of the probe is left in WorkOS.')
    }
  } catch (error) {
    // The listing itself could not be read, so nothing is known.
    console.error(
      `\nCOULD NOT CHECK what is left (${error instanceof Error ? error.message : String(error)}). Look for ${new URL(uri).host} in the WorkOS dashboard and remove it.`,
    )
    process.exitCode = 1
  }
  if (failure) throw failure
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
