/** @vitest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpeakerTalkPhotos } from '@/lib/photo-wall/wall'
import { SpeakerTalkPhotoList } from './SpeakerTalkPhotos'

const talk = (id: string, hidden: boolean, n: number): SpeakerTalkPhotos => ({
  talkId: id,
  title: `Talk ${id}`,
  hidden,
  posts: Array.from({ length: n }, (_, i) => ({
    _id: `${id}-${i}`,
    src: `/sq-${id}-${i}.jpg`,
    whole: { src: `/whole-${id}-${i}.jpg`, width: 2048, height: 1365 },
    caption: null,
    name: null,
    approvedAt: '2026-10-26T10:00:00Z',
  })),
})

describe('SpeakerTalkPhotoList (talk photos spec §7.3)', () => {
  it('renders nothing without photos', () => {
    const { container } = render(<SpeakerTalkPhotoList talks={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('links each photo to its whole image and marks a hidden talk', () => {
    render(
      <SpeakerTalkPhotoList
        talks={[talk('a', false, 2), talk('b', true, 1)]}
      />,
    )
    expect(screen.getByText('Photos of your talks (3)')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/whole-a-0.jpg',
      '/whole-a-1.jpg',
      '/whole-b-0.jpg',
    ])
    expect(screen.getAllByText(/Hidden from public pages/)).toHaveLength(1)
  })
})

describe('talk photo surfaces, at the source', () => {
  const read = (p: string) =>
    readFileSync(join(process.cwd(), p), 'utf8').replace(/^\s*\/\/.*$/gm, '')

  it("the public speaker page loads each talk's photos through the opt-out read (§7.2)", () => {
    // TalkPhotos reads photoWallPublic.talkPhotos -> getTalkPhotos, which
    // answers nothing while a speaker opted out (cache.test.ts).
    expect(read('src/app/(main)/speaker/[slug]/page.tsx')).toContain(
      '<TalkPhotos talkId={talk._id} />',
    )
  })

  it('the dashboard reads only after a signed-out visitor is redirected, for the session speaker (§7.3)', () => {
    const code = read('src/app/(cfp)/cfp/list/page.tsx')
    const redirect = code.indexOf('redirect(`/api/auth/signin')
    const read_ = code.indexOf(
      'readSpeakerTalkPhotos(conference._id, speakerId)',
    )
    expect(code).toContain('if (!session?.speaker) {')
    expect(code).toContain('const speakerId = speaker._id')
    expect(redirect).toBeGreaterThan(-1)
    expect(read_).toBeGreaterThan(redirect)
  })
})
