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
 * It touches WorkOS only — no Sanity read or write. It creates URIs on two
 * hosts nobody will ever sign in on (`redirect-uri-probe-<time>-a.example.org`
 * and `…-b…`), two so that the list has a second page to ask for even in an
 * empty environment. At the end it lists the environment and deletes every
 * entry on those hosts, whatever happened in between. If any is still there it
 * says so and exits non-zero. It refuses a key that is not `sk_test_…` unless
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
 * Delete every entry on the probe's hosts, found by LISTING — so it does not
 * depend on having read an id out of a create answer. Returns what is left.
 */
async function removeProbeUris(uris: string[]): Promise<string[]> {
  // By host, which is unique to this run: WorkOS may spell a URI its own way.
  const hosts = new Set(uris.map((uri) => new URL(uri).host))
  const isMine = (entry: { uri: string }) =>
    URL.canParse(entry.uri) && hosts.has(new URL(entry.uri).host)
  for (const entry of (await listRedirectUris()).filter(isMine)) {
    await call('Clean up', 'DELETE', `${ENDPOINT}/${entry.id}`)
  }
  return (await listRedirectUris()).filter(isMine).map((entry) => entry.id)
}

async function main(): Promise<void> {
  const stamp = Date.now()
  const uri = `https://redirect-uri-probe-${stamp}-a.example.org/api/auth/callback`
  const second = `https://redirect-uri-probe-${stamp}-b.example.org/api/auth/callback`
  const probes = [uri, second]
  let failure: unknown

  try {
    const created = await call('Create', 'POST', ENDPOINT, { uri })
    const createdId = idOf(created.body)
    const again = await call('Create the same URI again', 'POST', ENDPOINT, {
      uri,
    })
    console.log(
      `\nThe second create answered with the first entry's id: ${createdId !== undefined && idOf(again.body) === createdId}`,
    )
    await call('Create a second URI', 'POST', ENDPOINT, { uri: second })

    // Two entries exist now at the least, so there is a second page to ask for.
    const first = await call(
      'List, one per page, oldest first',
      'GET',
      `${ENDPOINT}?limit=1&order=asc`,
    )
    const after = (
      first.body as { list_metadata?: { after?: string | null } } | null
    )?.list_metadata?.after
    if (after) {
      const next = await call(
        'List, the page after that cursor',
        'GET',
        `${ENDPOINT}?limit=1&order=asc&after=${encodeURIComponent(after)}`,
      )
      console.log(
        `\nThe second page starts with a different entry: ${firstIdOf(next.body) !== undefined && firstIdOf(next.body) !== firstIdOf(first.body)}`,
      )
    } else {
      console.log(
        "\nNO `after` CURSOR on a one-entry page of a list that holds at least two entries: the client's pagination would stop early.",
      )
      process.exitCode = 1
    }

    if (createdId) {
      await call('Delete', 'DELETE', `${ENDPOINT}/${createdId}`)
      await call('Delete it again', 'DELETE', `${ENDPOINT}/${createdId}`)
    } else {
      console.log('\n(no id could be read from the create answer)')
    }
    // A duplicate WorkOS accepted, a delete it refused, and the second URI.
    await removeProbeUris(probes)

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
    console.log(
      '(The client asks for 100 per page, so its own cursor loop only runs in an environment holding more than 100 URIs. The raw calls above are the check of the cursor.)',
    )
  } catch (error) {
    failure = error
  }

  try {
    const left = await removeProbeUris(probes)
    if (left.length > 0) {
      console.error(
        `\nSTILL REGISTERED on the probe's hosts: ${left.join(', ')}. Remove them in the WorkOS dashboard (${probes.map((probe) => new URL(probe).host).join(', ')}).`,
      )
      process.exitCode = 1
    } else {
      console.log('\nNothing of the probe is left in WorkOS.')
    }
  } catch (error) {
    // The listing itself could not be read, so nothing is known.
    console.error(
      `\nCOULD NOT CHECK what is left (${error instanceof Error ? error.message : String(error)}). Look for ${probes.map((probe) => new URL(probe).host).join(' and ')} in the WorkOS dashboard and remove them.`,
    )
    process.exitCode = 1
  }
  if (failure) throw failure
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
