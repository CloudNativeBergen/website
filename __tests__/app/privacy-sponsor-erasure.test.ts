/**
 * /privacy on sponsor send records (#1265): the record of each email sent to
 * a sponsor contact is kept for the life of the sponsor record, and an
 * erasure request redacts the contact's name and email out of it while the
 * content as sent stays. Both halves must be on the page, or the disclosure
 * promises either too little retention or too much deletion.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const privacy = readFileSync(
  join(__dirname, '..', '..', 'src/app/(main)/privacy/page.tsx'),
  'utf8',
)
  .replace(/&apos;/g, "'")
  .replace(/&mdash;/g, '—')
  .replace(/\{' '\}/g, ' ')
  .replace(/\s+/g, ' ')

describe('sponsor send records on /privacy', () => {
  it('states the retention rule: for the life of the sponsor record', () => {
    expect(privacy).toContain(
      'This record is kept for the life of the sponsor record so the organization can show what it sent and to whom.',
    )
  })

  it('states what an erasure request does: name and email replaced, content kept', () => {
    expect(privacy).toContain(
      "If you ask us to erase your data, your name and email address in these records are replaced by a marker; the subject and body as sent are kept as the organization's business record, so a name written into the email text itself stays.",
    )
  })

  it('says the same in the retention table', () => {
    expect(privacy).toContain(
      'on an erasure request the recipient name and email are replaced by a marker and the rest of the record stays',
    )
  })
})
