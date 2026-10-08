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
 * It touches WorkOS only — no Sanity read or write — and removes the one URI it
 * creates. It refuses a key that is not `sk_test_…` unless `--allow-live`.
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

async function call(
  label: string,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<unknown> {
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
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function idOf(body: unknown): string | undefined {
  const top = body as { id?: string; redirect_uri?: { id?: string } }
  return top?.id ?? top?.redirect_uri?.id
}

async function main(): Promise<void> {
  const uri = `https://redirect-uri-probe-${Date.now()}.example.org/api/auth/callback`
  let createdId: string | undefined
  let duplicateId: string | undefined

  try {
    const firstPage = (await call(
      'List, one per page, oldest first',
      'GET',
      `${ENDPOINT}?limit=1&order=asc`,
    )) as { list_metadata?: { after?: string | null } } | undefined
    const after = firstPage?.list_metadata?.after
    if (after) {
      await call(
        'List, the page after that cursor',
        'GET',
        `${ENDPOINT}?limit=1&order=asc&after=${encodeURIComponent(after)}`,
      )
    } else {
      console.log('\n(no `after` cursor: the environment has at most one URI)')
    }

    createdId = idOf(await call('Create', 'POST', ENDPOINT, { uri }))
    // If WorkOS accepts a duplicate, that is a second URI to remove.
    duplicateId = idOf(
      await call('Create the same URI again', 'POST', ENDPOINT, { uri }),
    )
    if (duplicateId === createdId) duplicateId = undefined

    if (createdId) {
      await call('Delete', 'DELETE', `${ENDPOINT}/${createdId}`)
      await call('Delete it again', 'DELETE', `${ENDPOINT}/${createdId}`)
      createdId = undefined
    }
    if (duplicateId) {
      await call('Delete the duplicate', 'DELETE', `${ENDPOINT}/${duplicateId}`)
      duplicateId = undefined
    }

    console.log('\n### The same round trip through the client')
    const before = await listRedirectUris()
    console.log(`listRedirectUris(): ${before.length} URIs`)
    const created = await createRedirectUri(uri)
    createdId = created.id
    console.log('createRedirectUri():', created)
    const listed = (await listRedirectUris()).find((u) => u.id === created.id)
    console.log('…as the list returns it:', listed)
    await deleteRedirectUri(created.id)
    createdId = undefined
    console.log('deleteRedirectUri(): ok')
    const gone = !(await listRedirectUris()).some((u) => u.id === created.id)
    console.log(`gone from the list: ${gone}`)
  } finally {
    for (const id of [createdId, duplicateId]) {
      if (id) await call('Clean up', 'DELETE', `${ENDPOINT}/${id}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
