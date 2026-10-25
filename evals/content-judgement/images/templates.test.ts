import { describe, expect, it } from 'vitest'
import { imageTemplates } from './templates'

describe('generated template inventory', () => {
  it('includes every public template at a readable image resolution', async () => {
    const templates = await imageTemplates()
    expect(templates.map((template) => template.id)).toEqual([
      'badge-1',
      'badge-2',
      'idcard-1',
      'screen-email-1',
      'screen-sms-1',
      'whiteboard-phone-1',
      'boardingpass-1',
      'qr-poster-1',
      'qr-poster-2',
      'ad-flyer-1',
      'ad-flyer-2',
      'recruiter-1',
      'slide-1',
      'slide-2',
      'sponsor-banner-1',
    ])
    for (const template of templates) {
      expect(
        Math.min(template.width, template.height),
        template.id,
      ).toBeGreaterThanOrEqual(800)
      if (
        template.id.startsWith('badge-') ||
        template.id.startsWith('qr-poster-')
      )
        expect(
          template.html.includes('src="data:image/png;base64,'),
          template.id,
        ).toBe(true)
    }
  })
})
