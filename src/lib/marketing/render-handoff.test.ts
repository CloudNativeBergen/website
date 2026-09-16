import { describe, expect, it } from 'vitest'
import { renderAlt, renderHandoffRecipients } from './render-handoff'

describe('renderHandoffRecipients', () => {
  const sibling = {
    _id: 'publish',
    kind: 'publishing',
    variantId: 'variant',
    prerequisiteIds: ['render'],
  }
  it('selects exactly publishing Tasks with a variant and this prerequisite', () => {
    expect(
      renderHandoffRecipients('render', [
        sibling,
        { ...sibling, _id: 'check', kind: 'checklist' },
        { ...sibling, _id: 'other', prerequisiteIds: ['other'] },
        { ...sibling, _id: 'missing', variantId: null },
      ]),
    ).toEqual([sibling])
  })
})

describe('renderAlt', () => {
  it('uses nonempty configured alt', () => {
    expect(
      renderAlt({
        title: 'Card',
        alt: '  Accessible description  ',
        subjectName: 'Ada',
      }),
    ).toBe('Accessible description')
  })
  it('derives alt from title and subject when configured alt is blank', () => {
    expect(
      renderAlt({ title: 'Speaker card', alt: ' ', subjectName: 'Ada' }),
    ).toBe('Speaker card — Ada')
  })
  it('supports a subjectless render recipe', () => {
    expect(
      renderAlt({ title: 'Save the date', alt: null, subjectName: null }),
    ).toBe('Save the date')
  })
  it('never emits empty alt even for malformed stored content', () => {
    expect(renderAlt({ title: ' ', alt: ' ', subjectName: null })).toBe(
      'Conference promotion',
    )
  })
})
