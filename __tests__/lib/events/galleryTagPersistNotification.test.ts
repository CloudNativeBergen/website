/**
 * @vitest-environment node
 *
 * Unit tests for the gallery-tag notification-hub bus handler
 * (src/lib/events/handlers/galleryTagPersistNotification.ts).
 *
 * The data layer is mocked so we assert exactly which recipients get an in-app
 * notification when speakers are tagged in a gallery image:
 * - every tagged speaker (de-duplicated) gets a 'gallery_tagged' notification
 * - the actor (metadata.taggedBy), when present, is excluded
 * - an undefined taggedBy (the current survey TODO) is handled gracefully
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(async () => {}),
}))

import { createNotifications } from '@/lib/notification/sanity'
import { handleGalleryTagPersistNotification } from '@/lib/events/handlers/galleryTagPersistNotification'
import type { GallerySpeakerTaggedEvent } from '@/lib/events/types'
import type { NotificationInput } from '@/lib/notification/types'

type LooseMock = ReturnType<typeof vi.fn>
const createMock = createNotifications as unknown as LooseMock

const makeEvent = (
  speakerIds: string[],
  metadataOverrides: Partial<GallerySpeakerTaggedEvent['metadata']> = {},
): GallerySpeakerTaggedEvent =>
  ({
    eventType: 'gallery.speaker.tagged',
    timestamp: new Date(),
    image: { _id: 'img-1' },
    conference: { _id: 'conf-1', title: 'Test Conf' },
    speakers: speakerIds.map((id) => ({ _id: id, name: id })),
    metadata: {
      domain: 'example.com',
      ...metadataOverrides,
    },
  }) as unknown as GallerySpeakerTaggedEvent

const lastItems = (): NotificationInput[] =>
  createMock.mock.calls[
    createMock.mock.calls.length - 1
  ][0] as NotificationInput[]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('gallery tag persistence — one notification per tagged speaker', () => {
  it('notifies every tagged speaker with the right type/title/link', async () => {
    await handleGalleryTagPersistNotification(makeEvent(['sp-1', 'sp-2']))

    expect(createMock).toHaveBeenCalledTimes(1)
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['sp-1', 'sp-2'])
    for (const item of items) {
      expect(item.notificationType).toBe('gallery_tagged')
      expect(item.title).toBe('You were tagged in a conference photo')
      expect(item.link).toBe('/#gallery?img=img-1')
      expect(item.conferenceId).toBe('conf-1')
    }
  })

  it('de-duplicates a repeated speaker id', async () => {
    await handleGalleryTagPersistNotification(
      makeEvent(['sp-1', 'sp-1', 'sp-2']),
    )
    expect(
      lastItems()
        .map((i) => i.recipientId)
        .sort(),
    ).toEqual(['sp-1', 'sp-2'])
  })

  it('excludes the actor and sets actorId when taggedBy is present', async () => {
    await handleGalleryTagPersistNotification(
      makeEvent(['sp-1', 'actor-1', 'sp-2'], { taggedBy: 'actor-1' }),
    )
    const items = lastItems()
    expect(items.map((i) => i.recipientId).sort()).toEqual(['sp-1', 'sp-2'])
    for (const item of items) {
      expect(item.actorId).toBe('actor-1')
    }
  })

  it('handles an undefined taggedBy gracefully (no actorId, nobody excluded)', async () => {
    await handleGalleryTagPersistNotification(makeEvent(['sp-1', 'sp-2']))
    const items = lastItems()
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.actorId).toBeUndefined()
    }
  })
})
