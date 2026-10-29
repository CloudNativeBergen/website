import type { VersionedSanityStore } from './versionedSanityStore'

/**
 * THE EXACT TEXT of the one read the cached early-access links make (#1346),
 * taken from the real `conferenceEarlyAccessLinks` by running it once against
 * the test's store.
 *
 * A test that stands in for the cache, or fails "the cached read", has to
 * tell that read from every other. Telling it by a fragment of its text would
 * also pick any other query that happens to contain the fragment; this is
 * equality with what the function really sends, and follows it when it
 * changes.
 *
 * Call it in `beforeAll`: it resets the store.
 */
export async function cachedLinksQueryText(
  store: VersionedSanityStore,
): Promise<string> {
  const { conferenceEarlyAccessLinks } =
    await import('@/lib/workshop/early-access/links')
  store.reset([])
  await conferenceEarlyAccessLinks('conference-of-the-probe')
  if (store.reads.length !== 1) {
    throw new Error(
      `The cached links made ${store.reads.length} reads; this helper knows them as one.`,
    )
  }
  const [{ query }] = store.reads
  store.reset([])
  return query
}
