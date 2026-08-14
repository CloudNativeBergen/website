/**
 * What the LETTER actually says, read back out of the rendered PDF.
 *
 * This is the artifact a speaker hands to a consular officer, so these tests
 * assert against the generated PDF bytes rather than the content model: a row
 * that exists in `buildInvitationLetterContent` and never reaches the page is
 * worth nothing to the applicant.
 *
 * HOW: `@react-pdf/renderer` writes text as hex strings inside `TJ` arrays in a
 * Flate-compressed content stream. We decompress the stream via pdf-lib's object
 * model and reassemble the runs — the same technique
 * `__tests__/lib/pdf/signature-smoke.test.ts` uses against the sponsor contract.
 *
 * NOT covered: how any of it LOOKS. Playwright is broken on this machine, so
 * nothing here has been visually inspected — see the PR body.
 */
import { describe, it, expect } from 'vitest'
import { inflateSync } from 'zlib'
import { PDFDocument, PDFName, PDFArray, PDFRef, PDFRawStream } from 'pdf-lib'
import { buildInvitationLetterContent } from './content'
import { generateInvitationLetterPdf } from './pdf'
import type { ConfirmedSession, InvitationLetterDetails } from './types'
import type { Conference } from '@/lib/conference/types'

/** Every decompressed content stream in the document, concatenated. */
async function contentStreams(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const chunks: string[] = []

  for (let page = 0; page < doc.getPageCount(); page++) {
    const contents = doc.getPage(page).node.get(PDFName.of('Contents'))
    const refs: PDFRef[] = []

    if (contents instanceof PDFRef) {
      refs.push(contents)
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const ref = contents.get(i)
        if (ref instanceof PDFRef) refs.push(ref)
      }
    }

    for (const ref of refs) {
      const object = doc.context.lookup(ref)
      if (!(object instanceof PDFRawStream)) continue
      const raw = Buffer.from(object.contents)
      const isFlate =
        object.dict.get(PDFName.of('Filter'))?.toString() === '/FlateDecode'
      chunks.push((isFlate ? inflateSync(raw) : raw).toString('latin1'))
    }
  }

  return chunks.join('\n')
}

/**
 * Folds the punctuation the PDF and the source disagree about.
 *
 * The page is written in WinAnsiEncoding, where an en dash is the single byte
 * `\x96` and an em dash `\x97`; react-pdf also encodes every space (including the
 * thin spaces `Intl.formatRange` puts around a date range) as `\x09`, and
 * `formatOrgNumber` inserts non-breaking spaces. Both sides of every assertion
 * go through this, so tests can be written with the characters a human types.
 *
 * VERIFIED, not assumed: rendering `A-B.C D-E` with a real en dash, middot and
 * em dash through this same pipeline emits `41 | 96 42 | b7 43 09 44 97 45` --
 * i.e. the en dash and the middot reach the page as their real WinAnsi glyphs
 * rather than as a missing-glyph box.
 */
function fold(value: string): string {
  return value
    .replace(/[\u00a0\u2009\u0009]/g, ' ')
    .replace(/[\u2013\u2014\u0096\u0097]/g, '-')
}

/** The document's visible text, in layout order, as one searchable string. */
async function renderedText(bytes: Uint8Array): Promise<string> {
  const stream = await contentStreams(bytes)
  const runs: string[] = []

  for (const line of stream.split('\n')) {
    const trimmed = line.trim()
    if (!/T[Jj]$/.test(trimmed)) continue

    // Hex strings, both `<hex> Tj` and the `[<hex> kern <hex>] TJ` arrays
    // react-pdf emits — the kerning offsets split one word across several
    // strings, so they are concatenated with nothing between them.
    const hex = trimmed.match(/<([0-9A-Fa-f]*)>/g)
    if (hex) {
      runs.push(
        hex
          .map((part) =>
            Buffer.from(part.slice(1, -1), 'hex').toString('latin1'),
          )
          .join(''),
      )
      continue
    }

    const literal = trimmed.match(/\(((?:\\.|[^\\)])*)\)/g)
    if (literal) runs.push(literal.map((part) => part.slice(1, -1)).join(''))
  }

  expect(
    runs.length,
    'no text was extracted from the PDF — the extractor is broken, so every ' +
      'assertion below would pass vacuously',
  ).toBeGreaterThan(20)

  return fold(runs.join(''))
}

/**
 * Where each text run sits on the page, so LAYOUT can be asserted and not just
 * wording.
 *
 * react-pdf positions text by nesting `cm` translates and then emits a constant
 * `Tm`, so the `Tm` operand carries no information — the position has to be
 * accumulated from the transform stack, which is what `q`/`Q` bracket. Same
 * approach as `__tests__/lib/pdf/signature-smoke.test.ts` uses for images.
 *
 * The returned `depth` grows DOWNWARD (react-pdf flips the Y axis per page), so
 * a larger depth means further down the page. Only ever compared relatively.
 */
async function textDepths(
  bytes: Uint8Array,
): Promise<Array<{ text: string; depth: number }>> {
  type Matrix = [number, number, number, number, number, number]
  const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]

  const stream = await contentStreams(bytes)
  const stack: Matrix[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const out: Array<{ text: string; depth: number }> = []

  for (const line of stream.split('\n')) {
    const trimmed = line.trim()

    if (trimmed === 'q') {
      stack.push([...ctm] as Matrix)
      continue
    }
    if (trimmed === 'Q') {
      ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      continue
    }

    const cm = trimmed.match(
      /^([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) cm$/,
    )
    if (cm) {
      ctm = multiply(cm.slice(1).map(Number) as Matrix, ctm)
      continue
    }

    if (!/T[Jj]$/.test(trimmed)) continue

    const hex = trimmed.match(/<([0-9A-Fa-f]*)>/g)
    const text = hex
      ? hex
          .map((part) =>
            Buffer.from(part.slice(1, -1), 'hex').toString('latin1'),
          )
          .join('')
      : ''
    // Negated: the accumulated translate counts UP from the bottom of the
    // page, and a test reads far better when a bigger number means lower down.
    if (text) out.push({ text: fold(text), depth: -ctm[5] })
  }

  return out
}

/** Depth of the first run containing `needle`. Fails loudly when absent. */
function depthOf(
  runs: Array<{ text: string; depth: number }>,
  needle: string,
): number {
  const hit = runs.find((run) => run.text.includes(needle))
  expect(hit, `no text run contains "${needle}"`).toBeDefined()
  return hit!.depth
}

const baseConference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Bergen',
  organizerOrgNumber: '933338622',
  organizerAddress: 'Landåsveien 46, 5097 Bergen, Norway',
  city: 'Bergen',
  country: 'Norway',
  venueName: 'Bergen Conference Center',
  venueAddress: 'Conference Way 10',
  startDate: '2026-10-26',
  endDate: '2026-10-27',
  contactEmail: 'contact@cloudnativedays.no',
  domains: ['cloudnativedays.no'],
} as unknown as Conference

const details: InvitationLetterDetails = {
  fullName: 'Amina Yusuf',
  dateOfBirth: '1990-04-12',
  nationality: 'Kenyan',
  passportNumber: 'A1234567',
  role: 'speaker',
  costCoverage: { registrationFee: true, travel: false, accommodation: false },
}

const scheduledSession: ConfirmedSession = {
  title: 'Running Kubernetes on a Shoestring',
  date: '2026-10-26',
  startTime: '14:00',
  endTime: '14:45',
  track: 'Track 2',
}

function letterContent({
  conference = baseConference,
  sessions = [],
  overrides = {},
}: {
  conference?: Conference
  sessions?: ConfirmedSession[]
  overrides?: Partial<InvitationLetterDetails>
} = {}) {
  return buildInvitationLetterContent({
    details: { ...details, ...overrides },
    conference,
    signatory: {
      name: 'Hans Kristian Flaatten',
      title: 'Conference Chair',
      email: 'chair@cloudnativedays.no',
    },
    reference: 'INV-2026-K7M2QP',
    issuedAt: '2026-08-14T09:00:00Z',
    sessions,
  })
}

async function letterText(
  args: Parameters<typeof letterContent>[0] = {},
): Promise<string> {
  return renderedText(await generateInvitationLetterPdf(letterContent(args)))
}

/** Same letter, read back as positioned runs instead of as one string. */
async function letterDepths(
  args: Parameters<typeof letterContent>[0] = {},
): Promise<Array<{ text: string; depth: number }>> {
  return textDepths(await generateInvitationLetterPdf(letterContent(args)))
}

/** Same conference, minus one field. */
function without(field: keyof Conference): Conference {
  const copy = { ...baseConference } as Record<string, unknown>
  delete copy[field]
  return copy as unknown as Conference
}

describe('the rendered letter: organizer contact details', () => {
  it('prints the contact email an embassy form asks for', async () => {
    expect(await letterText()).toContain('contact@cloudnativedays.no')
  })

  it('prints the conference website, so the event can be verified', async () => {
    expect(await letterText()).toContain('https://cloudnativedays.no')
  })

  it('omits the email line entirely when the conference has none', async () => {
    const text = await letterText({ conference: without('contactEmail') })

    expect(text).not.toContain('contact@cloudnativedays.no')
    // The letterhead is still intact around the gap — an absent line must not
    // take its neighbours with it, and must not leave `undefined` behind.
    expect(text).toContain('Cloud Native Bergen')
    expect(text).toContain('Landåsveien 46, 5097 Bergen, Norway')
    expect(text).not.toContain('undefined')
  })
})

describe('the rendered letter: programme reference', () => {
  it('links the public programme on the conference’s own domain', async () => {
    expect(await letterText()).toContain('https://cloudnativedays.no/program')
  })

  it('labels it, so the officer knows what the link is', async () => {
    expect(await letterText()).toContain('Programme')
  })

  it('uses the FIRST usable domain, skipping wildcard routing entries', async () => {
    const text = await letterText({
      conference: {
        ...baseConference,
        domains: ['*.cloudnativedays.no', 'cndn.no'],
      } as unknown as Conference,
    })

    expect(text).toContain('https://cndn.no/program')
  })

  it('drops the row completely when no domain resolves', async () => {
    const text = await letterText({
      conference: { ...baseConference, domains: [] } as unknown as Conference,
    })

    expect(text).not.toContain('/program')
    expect(text).not.toContain('Programme')
    expect(text).not.toContain('undefined')
    // …and the rest of the event table is untouched.
    expect(text).toContain('Cloud Native Days Norway 2026')
    expect(text).toContain('Bergen Conference Center')
  })
})

describe('the rendered letter: confirmed programme sessions', () => {
  it('states the title, date, time and track of a scheduled talk', async () => {
    const text = await letterText({ sessions: [scheduledSession] })

    expect(text).toContain('Running Kubernetes on a Shoestring')
    expect(text).toContain(fold('26 October 2026 · 14:00-14:45 · Track 2'))
  })

  it('reads as a statement of purpose, not a stray table row', async () => {
    const text = await letterText({ sessions: [scheduledSession] })

    // Uppercased by the shared section-heading style, exactly like APPLICANT
    // and EVENT — so the block reads as a peer of them, not as an addendum.
    expect(text).toContain('PROGRAMME CONTRIBUTION')
    expect(text).toContain(
      'Amina Yusuf is confirmed to present the following as part of the official conference programme',
    )
    // Placed under the event facts and ahead of the cost paragraph, which is
    // where an officer looks for the purpose of the visit.
    expect(text.indexOf('PROGRAMME CONTRIBUTION')).toBeGreaterThan(
      text.indexOf('EVENT'),
    )
    expect(text.indexOf('PROGRAMME CONTRIBUTION')).toBeLessThan(
      text.indexOf('borne by the applicant'),
    )
  })

  it('renders every session when there is more than one', async () => {
    const text = await letterText({
      sessions: [
        scheduledSession,
        {
          title: 'Cutting the Cloud Bill in Half',
          date: '2026-10-27',
          startTime: '09:30',
          endTime: '10:15',
          track: 'Track 1',
        },
      ],
    })

    expect(text).toContain('Running Kubernetes on a Shoestring')
    expect(text).toContain('Cutting the Cloud Bill in Half')
    expect(text).toContain(fold('27 October 2026 · 09:30-10:15 · Track 1'))
  })

  it('keeps both of two sessions that share a title', async () => {
    const text = await letterText({
      sessions: [
        { ...scheduledSession, track: 'Track 1' },
        { ...scheduledSession, startTime: '16:00', endTime: '16:45' },
      ],
    })

    // A React key collision would silently drop the second one.
    expect(text).toContain(fold('14:00-14:45 · Track 1'))
    expect(text).toContain(fold('16:00-16:45 · Track 2'))
  })

  it('prints an unscheduled talk as a title alone, with nothing dangling', async () => {
    const text = await letterText({
      sessions: [{ title: 'Running Kubernetes on a Shoestring' }],
    })

    expect(text).toContain('Running Kubernetes on a Shoestring')
    expect(text).toContain('PROGRAMME CONTRIBUTION')
    expect(text).not.toContain('undefined')

    // Scoped to the block itself: the page footer legitimately uses the same
    // separator, so asserting over the whole document would be untestable. The
    // slice runs from the title to the paragraph that follows the block.
    const block = text.slice(
      text.indexOf('Running Kubernetes on a Shoestring'),
      text.indexOf('Amina Yusuf is participating as'),
    )
    expect(block.length).toBeGreaterThan(0)
    expect(block).not.toContain('·')
    expect(block).not.toContain('October')
  })

  it('omits the time when the slot has no end, rather than a half range', async () => {
    const text = await letterText({
      sessions: [{ ...scheduledSession, endTime: undefined }],
    })

    expect(text).toContain(fold('26 October 2026 · 14:00 · Track 2'))
    expect(text).not.toContain('14:00-')
  })

  it('draws no programme block at all for someone who is not presenting', async () => {
    const text = await letterText({ overrides: { role: 'attendee' } })

    expect(text).not.toContain('Conference programme')
    expect(text).not.toContain('confirmed to present')
  })

  // The wording tests above cannot see this: an unconditional
  // `<Text>{undefined}</Text>` draws no characters, so the letter READS
  // correctly while carrying a blank line inside the box and pushing
  // everything below it down the page. Only geometry catches it.
  it('leaves no blank line in the box when a talk is unscheduled', async () => {
    const title = 'Running Kubernetes on a Shoestring'
    const after = 'Amina Yusuf is participating as'

    const unscheduled = await letterDepths({ sessions: [{ title }] })
    const scheduled = await letterDepths({ sessions: [scheduledSession] })

    const tightGap = depthOf(unscheduled, after) - depthOf(unscheduled, title)
    const fullGap = depthOf(scheduled, after) - depthOf(scheduled, title)

    expect(tightGap).toBeGreaterThan(0)
    // One line of schedule text is exactly what the difference should be.
    expect(tightGap).toBeLessThan(fullGap)
  })

  it('leaves the applicant and passport rows exactly as they were', async () => {
    const text = await letterText({
      sessions: [scheduledSession],
      overrides: {
        gender: 'Female',
        passportExpiry: '2030-01-31',
        residentialAddress: 'Riverside Drive 4, Nairobi, Kenya',
      },
    })

    for (const expected of [
      'Full name',
      'Amina Yusuf',
      'Date of birth',
      '12 April 1990',
      'Gender',
      'Female',
      'Nationality',
      'Kenyan',
      'Passport number',
      'A1234567',
      'Passport valid until',
      '31 January 2030',
      'Residential address',
    ]) {
      expect(text, `missing "${expected}"`).toContain(expected)
    }
  })
})
