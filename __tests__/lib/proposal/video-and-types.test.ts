import { getProposalVideoUrl, hasProposalVideo } from '@/lib/proposal/video'
import { isWorkshopFormat, Format } from '@/lib/proposal/types'

describe('getProposalVideoUrl', () => {
  it('returns undefined when attachments is undefined', () => {
    expect(getProposalVideoUrl({ attachments: undefined })).toBeUndefined()
  })

  it('returns undefined when attachments is empty', () => {
    expect(getProposalVideoUrl({ attachments: [] })).toBeUndefined()
  })

  it('returns undefined when no recording attachment exists', () => {
    const proposal = {
      attachments: [
        {
          _type: 'urlAttachment' as const,
          _key: 'k1',
          url: 'https://slides.example.com',
          attachmentType: 'slides' as const,
        },
      ],
    }
    expect(getProposalVideoUrl(proposal)).toBeUndefined()
  })

  it('returns URL for recording attachment', () => {
    const proposal = {
      attachments: [
        {
          _type: 'urlAttachment' as const,
          _key: 'k1',
          url: 'https://youtube.com/watch?v=abc',
          attachmentType: 'recording' as const,
        },
      ],
    }
    expect(getProposalVideoUrl(proposal)).toBe(
      'https://youtube.com/watch?v=abc',
    )
  })

  it('ignores file attachments with recording type', () => {
    const proposal = {
      attachments: [
        {
          _type: 'fileAttachment' as const,
          _key: 'k1',
          file: {
            _type: 'file' as const,
            asset: { _ref: 'ref1', _type: 'reference' as const },
          },
          attachmentType: 'recording' as const,
        },
      ],
    }
    expect(getProposalVideoUrl(proposal)).toBeUndefined()
  })

  it('returns first recording URL when multiple exist', () => {
    const proposal = {
      attachments: [
        {
          _type: 'urlAttachment' as const,
          _key: 'k1',
          url: 'https://slides.example.com',
          attachmentType: 'slides' as const,
        },
        {
          _type: 'urlAttachment' as const,
          _key: 'k2',
          url: 'https://youtube.com/first',
          attachmentType: 'recording' as const,
        },
        {
          _type: 'urlAttachment' as const,
          _key: 'k3',
          url: 'https://youtube.com/second',
          attachmentType: 'recording' as const,
        },
      ],
    }
    expect(getProposalVideoUrl(proposal)).toBe('https://youtube.com/first')
  })
})

describe('hasProposalVideo', () => {
  it('returns false when no attachments', () => {
    expect(hasProposalVideo({ attachments: undefined })).toBe(false)
  })

  it('returns false when no recording', () => {
    expect(hasProposalVideo({ attachments: [] })).toBe(false)
  })

  it('returns true when recording exists', () => {
    const proposal = {
      attachments: [
        {
          _type: 'urlAttachment' as const,
          _key: 'k1',
          url: 'https://youtube.com/watch?v=abc',
          attachmentType: 'recording' as const,
        },
      ],
    }
    expect(hasProposalVideo(proposal)).toBe(true)
  })
})

describe('isWorkshopFormat', () => {
  it('returns true for workshop_120', () => {
    expect(isWorkshopFormat(Format.workshop_120)).toBe(true)
  })

  it('returns true for workshop_240', () => {
    expect(isWorkshopFormat(Format.workshop_240)).toBe(true)
  })

  it('returns false for lightning_10', () => {
    expect(isWorkshopFormat(Format.lightning_10)).toBe(false)
  })

  it('returns false for presentation formats', () => {
    expect(isWorkshopFormat(Format.presentation_20)).toBe(false)
    expect(isWorkshopFormat(Format.presentation_25)).toBe(false)
    expect(isWorkshopFormat(Format.presentation_40)).toBe(false)
    expect(isWorkshopFormat(Format.presentation_45)).toBe(false)
  })
})
