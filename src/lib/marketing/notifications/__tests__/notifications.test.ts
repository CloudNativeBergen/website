// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  createNotifications: vi.fn(async (items: unknown[]) => items.length),
  organizers: vi.fn<(orgId: string | null) => Promise<string[]>>(
    async () => [],
  ),
  reminders: vi.fn(),
  readError: false,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: async (query: string, params: Record<string, unknown>) => {
      if (h.readError) throw new Error('read failed')
      return (
        await evaluate(parse(query), { dataset: h.dataset, params })
      ).get()
    },
  },
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: h.createNotifications,
  getOrganizerSpeakerIdsForOrg: h.organizers,
}))
vi.mock('@/lib/marketing/reminders', () => ({
  runMarketingReminders: h.reminders,
}))

import {
  notifyMarketingFailure,
  notifyMarketingAwaitingManual,
  notifyMarketingTagsWithheld,
} from '../sanity'
import { runPublishTick } from '@/lib/social/publish-engine'
import {
  makeVariant,
  MemoryVariantStore,
} from '@/lib/social/__tests__/memory-store'
import type { PublishableVariant } from '@/lib/social/store'

const now = new Date('2026-09-13T10:00:00.000Z')
const task = (
  id = 'task-a',
  conferenceId = 'conf-1',
  variantId = 'variant-1',
  assignee: string | null = 'assignee',
) => ({
  _id: id,
  _type: 'marketingTask',
  title: 'Launch',
  kind: 'publishing',
  conference: { _ref: conferenceId },
  variant: { _ref: variantId },
  assignee: assignee ? { _ref: assignee } : null,
})
const publishable = (
  id = 'variant-1',
  conferenceId = 'conf-1',
): PublishableVariant => ({
  ...makeVariant({ _id: id, conferenceId }),
  postCreatedBy: 'creator',
  marketingTaskId: null,
  postAttachments: [],
  conferenceDomains: [],
  shortLinkOrigin: null,
})
const event = () => ({
  variant: makeVariant(),
  attempt: {
    _key: 'attempt-one',
    at: now.toISOString(),
    outcome: 'rejected' as const,
  },
})

beforeEach(() => {
  h.dataset = []
  h.readError = false
  vi.clearAllMocks()
})

describe('marketing transition notifications', () => {
  it('sends the failure kind immediately to the task assignee with event identity', async () => {
    h.dataset = [task()]
    expect(await notifyMarketingFailure(event())).toBe(1)
    expect(h.createNotifications.mock.calls[0][0]).toEqual([
      {
        recipientId: 'assignee',
        conferenceId: 'conf-1',
        notificationType: 'marketing_task_failed',
        title: 'Marketing task failed',
        message: 'Launch: rejected',
        link: '/admin/marketing/tasks/task-a',
        tag: 'marketing-failure.variant-1.attempt-one',
      },
    ])
  })

  it("notifies a STANDALONE post's creator when there is no Task (#1128)", async () => {
    // A standalone post publishes automatically like any other, so a terminal
    // failure that notified nobody left it sitting `failed` on a page the
    // organizer had no reason to reopen. That matters most for `ambiguous`,
    // where the post may be live and waiting to be reconciled.
    h.dataset = [
      {
        _id: 'variant-1',
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
        post: { _ref: 'post-1' },
      },
      {
        _id: 'post-1',
        _type: 'socialPost',
        // Real posts always carry their conference, and the recipient lookup
        // now requires it to match the variant's.
        conference: { _ref: 'conf-1' },
        createdBy: { _ref: 'creator' },
      },
    ]

    expect(await notifyMarketingFailure(event())).toBe(1)
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        recipientId: 'creator',
        notificationType: 'social_publish_failed',
        // Links to the POST, because there is no Task to open.
        link: '/admin/marketing/posts?variant=variant-1',
        tag: 'social-failure.variant-1.attempt-one',
      },
    ])
  })

  it("NEVER notifies another tenant's user through a foreign post reference", async () => {
    // `scopedFetch` constrains the root variant only. A hand-edited or corrupt
    // reference from this conference's variant to ANOTHER conference's post
    // would otherwise return that tenant's creator — who would get a
    // persistent notification and a web push about a post they cannot see.
    h.dataset = [
      {
        _id: 'variant-1',
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
        post: { _ref: 'post-foreign' },
      },
      {
        _id: 'post-foreign',
        _type: 'socialPost',
        conference: { _ref: 'conf-OTHER' },
        createdBy: { _ref: 'other-tenant-user' },
      },
    ]

    // ON THE VALUE: nobody is notified, and certainly not the other tenant.
    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications).not.toHaveBeenCalled()
  })

  it('notifies NOBODY when a standalone post has no creator left', async () => {
    // The control: an erased or cross-tenant creator must not fall back to
    // notifying every organizer — the same choice `manualDueNotifications`
    // makes. A test that only asserted "no error" would pass either way.
    h.dataset = [
      {
        _id: 'variant-1',
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
      },
    ]

    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications).not.toHaveBeenCalled()
  })

  it('selects only the live task in the failing variant conference', async () => {
    h.dataset = [
      task('foreign', 'conf-b'),
      task('drafts.bad'),
      task('versions.release.bad'),
      task(),
    ]
    await notifyMarketingFailure(event())
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { link: '/admin/marketing/tasks/task-a' },
    ])
  })

  it('does not send to a creator or anyone else when the task has no assignee', async () => {
    h.dataset = [task('task-a', 'conf-1', 'variant-1', null)]
    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications.mock.calls).toEqual([[[]]])
  })

  it('standalone failure does not introduce a new notification', async () => {
    expect(await notifyMarketingFailure(event())).toBe(0)
    expect(h.createNotifications).toHaveBeenCalledTimes(0)
  })

  it('a task read failure never escapes the already settled business transition', async () => {
    h.readError = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyMarketingFailure(event())).toBe(0)
  })

  it('concurrent stale failure transitions call createNotifications just once, and persist the same event key', async () => {
    h.dataset = [task()]
    const store = new MemoryVariantStore([
      makeVariant({
        status: 'publishing',
        claimedAt: '2026-09-13T09:00:00.000Z',
      }),
    ])
    const options = {
      store,
      now,
      resolveAdapter: async () => null,
      onFailed: notifyMarketingFailure,
    }
    const results = await Promise.all([
      runPublishTick(options),
      runPublishTick(options),
    ])
    expect(results.reduce((sum, row) => sum + row.staleFailed, 0)).toBe(1)
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        message: 'Launch: stale-claim',
        tag: `marketing-failure.variant-1.${store.get('variant-1').attempts[0]._key}`,
      },
    ])
  })

  it('task-backed manual handoff suppresses creator notifications and triggers the CAS reminder engine; standalone behavior is preserved', async () => {
    h.dataset = [
      task(),
      ...['variant-1', 'standalone'].map((_id) => ({
        _id,
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
      })),
    ]
    await notifyMarketingAwaitingManual([
      publishable(),
      publishable('standalone'),
    ])
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        recipientId: 'creator',
        notificationType: 'social_manual_due',
        link: '/admin/marketing/posts?variant=standalone',
      },
    ])
    expect(h.createNotifications.mock.calls[0][0]).toHaveLength(1)
    expect(h.reminders).toHaveBeenCalledWith('conf-1', expect.any(String))
  })

  it('preserves the standalone creator notification when the task lookup fails', async () => {
    h.readError = true
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await notifyMarketingAwaitingManual([publishable('standalone')])

    expect(
      h.createNotifications.mock.calls.flatMap(([items]) => items),
    ).toEqual([
      {
        recipientId: 'creator',
        conferenceId: 'conf-1',
        notificationType: 'social_manual_due',
        title: 'Post by hand on Bluesky',
        message: 'Hello from the conference',
        link: '/admin/marketing/posts?variant=standalone',
      },
    ])
  })

  it('a foreign task cannot suppress a standalone creator notification', async () => {
    h.dataset = [
      task('foreign', 'conf-b'),
      {
        _id: 'variant-1',
        _type: 'socialPostVariant',
        conference: { _ref: 'conf-1' },
      },
    ]
    await notifyMarketingAwaitingManual([publishable()])
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { recipientId: 'creator' },
    ])
    expect(h.reminders).toHaveBeenCalledTimes(0)
  })
})

describe('a tag withheld at publish (tagging spec §4.4, Publish)', () => {
  const withheldEvent = (marketingTaskId: string | null = 'task-a') => ({
    variant: { ...publishable(), orgId: 'org-1', marketingTaskId },
    withheld: [
      {
        speakerId: 'alice',
        name: 'Alice Smith',
        handles: ['alice.dev'],
        reason: 'opted-out' as const,
      },
    ],
  })

  it("sends ONE notification per organizer of the variant's organization, linking to the Task", async () => {
    h.organizers.mockResolvedValue(['org-a', 'org-b', 'org-a'])
    expect(await notifyMarketingTagsWithheld(withheldEvent())).toBe(2)
    expect(h.organizers).toHaveBeenCalledWith('org-1')
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    expect(h.createNotifications.mock.calls[0][0]).toEqual(
      ['org-a', 'org-b'].map((recipientId) => ({
        recipientId,
        conferenceId: 'conf-1',
        notificationType: 'marketing_task_tag_withheld',
        title: 'Posted without a tag',
        message:
          'Alice Smith asked not to be tagged after the post was approved, so it went out with their name instead of @alice.dev.',
        link: '/admin/marketing/tasks/task-a',
        tag: 'marketing-tag-withheld.variant-1',
      })),
    )
  })

  it('every organizer hears it EXCEPT the speaker whose opt-out it is — never told about their own choice (review T5)', async () => {
    h.organizers.mockResolvedValue(['org-a', 'alice', 'org-b'])
    await notifyMarketingTagsWithheld(withheldEvent())
    expect(
      (h.createNotifications.mock.calls[0][0] as { recipientId: string }[]).map(
        (n) => n.recipientId,
      ),
    ).toEqual(['org-a', 'org-b'])
  })

  it('says why: an opt-out and a speaker who is gone read differently', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    await notifyMarketingTagsWithheld({
      ...withheldEvent(),
      withheld: [
        {
          speakerId: 'alice',
          name: 'Alice Smith',
          handles: ['alice.dev'],
          reason: 'opted-out',
        },
        { speakerId: 'bob', reason: 'gone' },
      ],
    })
    const [n] = h.createNotifications.mock.calls[0][0] as { message: string }[]
    expect(n.message).toBe(
      'Alice Smith asked not to be tagged after the post was approved, so it went out with their name instead of @alice.dev. A tag of someone who is no longer a speaker here was replaced with “a speaker”.',
    )
  })

  it('a sponsor tag withheld for a speaker who lists the account: the company is named, the speaker never (#1154)', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    await notifyMarketingTagsWithheld({
      ...withheldEvent(),
      withheld: [
        {
          reason: 'listed-by-opted-out',
          sponsorId: 'sponsor-acme',
          name: 'Acme AS',
          handles: ['acme.com'],
        },
      ],
    })
    const [n] = h.createNotifications.mock.calls[0][0] as { message: string }[]
    expect(n.message).toBe(
      '@acme.com went out as “Acme AS”: someone who asked not to be tagged lists that account.',
    )
  })

  it('a speaker with two withheld handles is named once, with both handles (round 4, T1)', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    await notifyMarketingTagsWithheld({
      ...withheldEvent(),
      withheld: [
        {
          speakerId: 'alice',
          name: 'Alice Smith',
          handles: ['alice.dev', 'alice.bsky.social'],
          reason: 'opted-out',
        },
      ],
    })
    const [n] = h.createNotifications.mock.calls[0][0] as { message: string }[]
    expect(n.message).toBe(
      'Alice Smith asked not to be tagged after the post was approved, so it went out with their name instead of @alice.dev, @alice.bsky.social.',
    )
  })

  it('a gone speaker alone: the notification names nobody (GDPR)', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    await notifyMarketingTagsWithheld({
      ...withheldEvent(),
      withheld: [
        { speakerId: 'bob', reason: 'gone' },
        { speakerId: 'carol', reason: 'gone' },
      ],
    })
    const [n] = h.createNotifications.mock.calls[0][0] as { message: string }[]
    expect(n.message).toBe(
      '2 tags of people who are no longer speakers here were replaced with “a speaker”.',
    )
  })

  it('a standalone post links to the post itself', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    await notifyMarketingTagsWithheld(withheldEvent(null))
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { link: '/admin/marketing/posts?variant=variant-1' },
    ])
  })

  it('never throws: an organizer read or a write that fails is logged', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.organizers.mockRejectedValueOnce(new Error('read failed'))
    await expect(notifyMarketingTagsWithheld(withheldEvent())).resolves.toBe(0)
    h.organizers.mockResolvedValue(['org-a'])
    h.createNotifications.mockRejectedValueOnce(new Error('write failed'))
    await expect(notifyMarketingTagsWithheld(withheldEvent())).resolves.toBe(0)
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })

  it('end to end: a failing notification write leaves the post published with the posted body', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.organizers.mockResolvedValue(['org-a'])
    h.createNotifications.mockRejectedValueOnce(new Error('write failed'))
    const store = new MemoryVariantStore([
      makeVariant({ body: 'Hi @alice.dev' }),
    ])
    store.tags['variant-1'] = [
      {
        handle: 'alice.dev',
        did: 'did:plc:alice',
        name: 'Alice Smith',
        speakerId: 'alice',
        optedOut: true,
      },
    ]
    const publish = vi.fn(async () => ({
      ok: true as const,
      externalId: 'x',
      url: 'y',
    }))
    const summary = await runPublishTick({
      store,
      now,
      resolveAdapter: async () => ({
        platform: 'bluesky',
        constraints: {
          maxLength: 300,
          counting: 'graphemes',
          maxImages: 4,
          imageMimeTypes: ['image/jpeg'],
          requiresImage: false,
          requiresAlt: true,
          urlLengthCost: null,
          linkPlacement: 'card',
          imageAspectRatio: null,
          maxBytes: null,
          linkCardDisplacesImages: false,
        },
        validate: () => [],
        publish,
      }),
      onTagsWithheld: notifyMarketingTagsWithheld,
    })
    expect(store.get('variant-1')).toMatchObject({
      status: 'published',
      body: 'Hi Alice Smith',
    })
    expect(summary).toMatchObject({ published: 1, errors: [] })
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})

/**
 * A FAILED CONFIRMATION (#1130, spec §3.3/§4): the asynchronous publisher
 * (Buffer) accepted the post and then reported it did not go out, or it
 * vanished, or never settled. The usual cause is LinkedIn's re-authorization
 * in Buffer's UI — an organization-wide problem any organizer can fix — so
 * every organizer hears it, with Buffer's own words, linked to the post.
 */
describe('a failed confirmation notifies every organizer (#1130)', () => {
  const submitted = () =>
    makeVariant({
      platform: 'linkedin',
      status: 'submitted',
      orgId: 'org-1',
      submission: {
        vendorPostId: 'buffer-1',
        submittedAt: '2026-09-13T09:55:00.000Z',
        lastCheckedAt: null,
      },
    })
  const failed = (
    outcome: 'rejected' | 'ambiguous' = 'rejected',
    error = 'LinkedIn access token expired. Reconnect the channel.',
  ) => ({
    variant: submitted(),
    attempt: { _key: 'confirm-1', at: now.toISOString(), outcome, error },
  })

  it("sends Buffer's message to each organizer, linked to the post, one doc per organizer in ONE call", async () => {
    // A Task behind the variant must not divert it to the assignee alone.
    h.dataset = [task()]
    h.organizers.mockResolvedValueOnce(['org-a', 'org-b', 'org-a'])

    expect(await notifyMarketingFailure(failed())).toBe(2)

    expect(h.organizers).toHaveBeenCalledWith('org-1')
    expect(h.createNotifications).toHaveBeenCalledTimes(1)
    expect(h.createNotifications.mock.calls[0][0]).toEqual(
      ['org-a', 'org-b'].map((recipientId) => ({
        recipientId,
        conferenceId: 'conf-1',
        notificationType: 'social_publish_failed',
        title: 'Buffer could not post to LinkedIn',
        message: 'LinkedIn access token expired. Reconnect the channel.',
        link: '/admin/marketing/posts?variant=variant-1',
        tag: 'social-failure.variant-1.confirm-1',
      })),
    )
  })

  it('an AMBIGUOUS confirmation says it could not confirm, never that it failed', async () => {
    h.organizers.mockResolvedValueOnce(['org-a'])
    await notifyMarketingFailure(
      failed(
        'ambiguous',
        'The publisher did not confirm the post within 15 minutes. Check the platform before posting again.',
      ),
    )
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        title: 'LinkedIn post not confirmed',
        message:
          'The publisher did not confirm the post within 15 minutes. Check the platform before posting again.',
      },
    ])
  })

  it("caps Buffer's free-text message", async () => {
    h.organizers.mockResolvedValueOnce(['org-a'])
    await notifyMarketingFailure(failed('rejected', 'x'.repeat(2000)))
    const [item] = h.createNotifications.mock.calls[0][0] as {
      message: string
    }[]
    expect(item.message.length).toBeLessThanOrEqual(300)
    expect(item.message.endsWith('…')).toBe(true)
  })

  it('an organization with no organizers notifies nobody and writes nothing', async () => {
    h.organizers.mockResolvedValueOnce([])
    expect(await notifyMarketingFailure(failed())).toBe(0)
    expect(h.createNotifications).not.toHaveBeenCalled()
  })

  it('an organizer lookup that throws never escapes into the sweep', async () => {
    h.organizers.mockRejectedValueOnce(new Error('sanity down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyMarketingFailure(failed())).toBe(0)
    error.mockRestore()
  })

  it('END TO END: the confirm sweep hands this path the submitted variant, and the variant stays failed', async () => {
    h.organizers.mockResolvedValue(['org-a'])
    const store = new MemoryVariantStore([submitted()])
    const summary = await runPublishTick({
      store,
      now,
      resolveAdapter: async () => ({
        platform: 'linkedin',
        constraints: {
          maxLength: 3000,
          counting: 'graphemes',
          maxImages: 9,
          imageMimeTypes: ['image/jpeg'],
          requiresImage: false,
          requiresAlt: true,
          urlLengthCost: null,
          linkPlacement: 'comment',
          imageAspectRatio: null,
          maxBytes: null,
          linkCardDisplacesImages: false,
        },
        validate: () => [],
        publish: async () => ({
          ok: false as const,
          kind: 'transient' as const,
          message: 'unused',
        }),
        confirm: async () => ({
          state: 'failed' as const,
          message: 'Token expired',
        }),
      }),
      onFailed: notifyMarketingFailure,
    })
    expect(summary).toMatchObject({ confirmFailed: 1, errors: [] })
    expect(store.get('variant-1').status).toBe('failed')
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      {
        recipientId: 'org-a',
        message: 'Token expired',
        link: '/admin/marketing/posts?variant=variant-1',
      },
    ])
    h.organizers.mockReset()
  })

  it('a stale PUBLISHING claim keeps the assignee path (only a failed confirmation fans out)', async () => {
    h.dataset = [task()]
    await notifyMarketingFailure({
      variant: makeVariant({ platform: 'linkedin', status: 'publishing' }),
      attempt: { _key: 'k', at: now.toISOString(), outcome: 'stale-claim' },
    })
    expect(h.organizers).not.toHaveBeenCalled()
    expect(h.createNotifications.mock.calls[0][0]).toMatchObject([
      { recipientId: 'assignee', notificationType: 'marketing_task_failed' },
    ])
  })
})
