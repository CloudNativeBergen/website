import { describe, it, expect } from 'vitest'
import {
  defaultRecipientKey,
  describeCommunication,
  isTemplateEdited,
  resolveRecipients,
  withoutKeys,
} from './communication'

const link = (keys: [string, string], texts: [string, string]) => [
  {
    _type: 'block',
    _key: 'b',
    style: 'normal',
    markDefs: [
      { _type: 'link', _key: keys[0], href: 'https://x.example' },
      { _type: 'link', _key: keys[1], href: 'https://y.example' },
    ],
    children: [
      { _type: 'span', _key: 's1', text: texts[0], marks: [keys[0]] },
      { _type: 'span', _key: 's2', text: texts[1], marks: [keys[1]] },
    ],
  },
]

describe('withoutKeys / isTemplateEdited', () => {
  const applied = { subject: 'S', body: link(['A', 'B'], ['one', 'two']) }

  it('treats re-keyed link annotations as identical', () => {
    const rekeyed = link(['Q', 'R'], ['one', 'two'])
    expect(isTemplateEdited(applied, { subject: 'S', message: rekeyed })).toBe(
      false,
    )
  })

  it('still sees the links trading places as an edit', () => {
    const swapped = [
      {
        ...link(['A', 'B'], ['one', 'two'])[0],
        markDefs: [
          { _type: 'link', _key: 'B', href: 'https://x.example' },
          { _type: 'link', _key: 'A', href: 'https://y.example' },
        ],
      },
    ]
    expect(isTemplateEdited(applied, { subject: 'S', message: swapped })).toBe(
      true,
    )
  })

  it('ignores editor defaults but not a real mark or style change', () => {
    const plain = [
      {
        _type: 'block',
        _key: 'b',
        style: 'normal',
        markDefs: [],
        children: [{ _type: 'span', _key: 's', text: 'x', marks: [] }],
      },
    ]
    const base = { subject: 'S', body: plain }
    const defaultsDropped = [
      {
        _type: 'block',
        _key: 'z',
        children: [{ _type: 'span', _key: 'y', text: 'x' }],
      },
    ]
    expect(
      isTemplateEdited(base, { subject: 'S', message: defaultsDropped }),
    ).toBe(false)
    const bolded = [
      {
        _type: 'block',
        _key: 'b',
        children: [{ _type: 'span', _key: 's', text: 'x', marks: ['strong'] }],
      },
    ]
    expect(isTemplateEdited(base, { subject: 'S', message: bolded })).toBe(true)
    const heading = [{ ...plain[0], style: 'h2' }]
    expect(isTemplateEdited(base, { subject: 'S', message: heading })).toBe(
      true,
    )
    expect(withoutKeys({ _key: 'k', a: 1 })).toEqual({ a: 1 })
  })
})

describe('defaultRecipientKey', () => {
  const c = (k: string, email: string, isPrimary = false) => ({
    _key: k,
    name: k,
    email,
    isPrimary,
  })
  it('is the primary contact when they have an email', () => {
    expect(defaultRecipientKey([c('a', 'a@x'), c('b', 'b@x', true)])).toBe('b')
  })
  it('is nobody when the primary has no email, even if another contact does', () => {
    expect(
      defaultRecipientKey([c('a', 'a@x'), c('b', '', true)]),
    ).toBeUndefined()
  })
  it('is the only contact when there is exactly one with an email', () => {
    expect(defaultRecipientKey([c('a', 'a@x')])).toBe('a')
    expect(defaultRecipientKey([c('a', '')])).toBeUndefined()
    expect(defaultRecipientKey([c('a', 'a@x'), c('b', 'b@x')])).toBeUndefined()
  })
})

describe('resolveRecipients / describeCommunication', () => {
  const contacts = [
    { _key: 'b', name: 'Billing', email: 'b@x', role: 'Billing Reference' },
    { _key: 'p', name: 'Primary', email: 'p@x', isPrimary: true },
  ]
  it('stores the address in its canonical form, so the erasure read can find it', () => {
    // GROQ can `lower()` but not trim: the erasure (#1265) matches a
    // recipient snapshot with `lower(email) in $emails`, so stray whitespace
    // or casing typed into a contact must never reach the record.
    const typed = [{ ...contacts[1], email: '  Primary@Example.COM ' }]
    expect(resolveRecipients(typed, ['p'])[0].email).toBe('primary@example.com')
  })

  it('orders by contact order whatever order the keys arrive in', () => {
    expect(resolveRecipients(contacts, ['p', 'b']).map((r) => r.name)).toEqual([
      'Billing',
      'Primary',
    ])
    expect(resolveRecipients(contacts, ['p'])[0]).toMatchObject({
      isDefault: true,
      email: 'p@x',
    })
  })
  it('describes a send and a failure', () => {
    const r = resolveRecipients(contacts, ['p', 'b'])
    expect(describeCommunication('information', r)).toBe(
      'Information sent to Billing (+1)',
    )
    expect(describeCommunication('contract', [r[1]], 'failed')).toBe(
      'Contract failed to send to Primary',
    )
  })
})
