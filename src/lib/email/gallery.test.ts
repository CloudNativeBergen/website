/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'

const send = vi.fn<(payload: unknown) => Promise<unknown>>(async () => ({
  data: { id: 'e1' },
  error: null,
}))
vi.mock('./config', () => ({
  resolveEmailSender: async () => ({ client: { emails: { send } } }),
  retryWithBackoff: <T>(fn: () => Promise<T>) => fn(),
}))

import { sendGalleryTagEmail } from './gallery'
import { formatDate } from '@/lib/time'
import type { GalleryTagEmailRequest } from './gallery'

describe('sendGalleryTagEmail', () => {
  it('shows the conference date formatted, not as a raw ISO string', async () => {
    const result = await sendGalleryTagEmail({
      speaker: { _id: 's1', name: 'Ada', email: 'ada@example.com' },
      image: { _id: 'img1', imageUrl: 'https://cdn.example/x.jpg' },
      conference: {
        title: 'Conf',
        city: 'Bergen',
        country: 'Norway',
        startDate: '2026-10-28T09:00:00.000Z',
        cfpEmail: 'cfp@conf.example',
      },
      domain: 'conf.example',
    } as unknown as GalleryTagEmailRequest)

    expect(result.success).toBe(true)
    const html = (send.mock.calls[0][0] as { html: string }).html
    expect(html).not.toContain('2026-10-28T09:00')
    expect(html).toContain(formatDate('2026-10-28T09:00:00.000Z'))
  })
})
