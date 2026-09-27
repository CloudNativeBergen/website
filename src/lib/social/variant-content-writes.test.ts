// @vitest-environment node
/**
 * `updateSocialVariantContent` writing the rebuilt Bluesky `mentions[]`
 * (#1151, tagging spec §4.3) against the REAL `@sanity/client` transaction
 * builder and Sanity's REAL patch semantics (`@sanity/mutator`). Only the
 * network commit is intercepted.
 */
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  transactions: [] as { serialize: () => unknown[] }[],
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })
  return {
    clientReadUncached: { fetch: vi.fn() },
    clientWrite: {
      transaction: () => {
        const tx = client.transaction()
        tx.commit = (async () => {
          h.transactions.push(tx)
          return {}
        }) as typeof tx.commit
        return tx
      },
    },
  }
})

import { updateSocialVariantContent } from './sanity'
import { mentionDocuments } from '@/lib/marketing/tagging/records'

type Doc = Record<string, unknown> & { _id: string }
const { Mutation } = createRequire(
  createRequire(import.meta.url).resolve('sanity/package.json'),
)('@sanity/mutator') as {
  Mutation: new (options: { mutations: unknown[] }) => {
    apply: (doc: Doc | null) => Doc | null
  }
}

const OLD_TAG = mentionDocuments([
  {
    _key: 'spk-bob',
    handle: 'bob.dev',
    did: 'did:plc:bob',
    speakerId: 'spk-bob',
    name: 'Bob',
    status: 'tagged',
  },
])
const NEW_TAG = mentionDocuments([
  {
    _key: 'spk-alice',
    handle: 'alice.dev',
    did: 'did:plc:alice',
    speakerId: 'spk-alice',
    name: 'Alice',
    status: 'tagged',
  },
])

function doc(): Doc {
  return {
    _id: 'variant-1',
    _type: 'socialPostVariant',
    _rev: 'rev-1',
    body: 'old @bob.dev',
    mentions: OLD_TAG,
  }
}

async function saved(mentions?: typeof NEW_TAG): Promise<Doc | null> {
  h.transactions.length = 0
  await updateSocialVariantContent(
    'variant-1',
    {
      body: 'new',
      link: null,
      attachments: [],
      scheduledAt: null,
      usesCustomTime: false,
      ...(mentions ? { mentions } : {}),
    },
    { ifRevision: 'rev-1' },
  )
  const [tx] = h.transactions
  return new Mutation({ mutations: tx.serialize() }).apply(doc())
}

beforeEach(() => {
  h.transactions.length = 0
})

describe('updateSocialVariantContent mentions', () => {
  it('replaces the record with the rebuilt one, weak speaker ref and all', async () => {
    expect((await saved(NEW_TAG))?.mentions).toEqual([
      {
        _key: 'spk-alice',
        _type: 'socialPostMention',
        handle: 'alice.dev',
        did: 'did:plc:alice',
        speaker: { _type: 'reference', _ref: 'spk-alice', _weak: true },
        name: 'Alice',
        status: 'tagged',
      },
    ])
  })

  it('an empty rebuild REMOVES the old record', async () => {
    const after = await saved([])
    expect(after?.body).toBe('new')
    expect(after).not.toHaveProperty('mentions')
  })

  it('no rebuild (another platform) leaves the record alone', async () => {
    expect((await saved())?.mentions).toEqual(OLD_TAG)
  })
})
