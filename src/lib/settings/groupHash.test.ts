// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { hashTargetsWithin } from './groups'

function group() {
  const root = document.createElement('div')
  root.id = 'identity-brand'
  root.innerHTML = '<div><div id="visibility"></div></div>'
  return root
}

describe('hashTargetsWithin', () => {
  it('matches the group anchor itself', () => {
    expect(hashTargetsWithin(group(), '#identity-brand')).toBe(true)
  })

  it('matches a card anchor inside the group', () => {
    expect(hashTargetsWithin(group(), '#visibility')).toBe(true)
  })

  it('ignores anchors elsewhere and empty hashes', () => {
    expect(hashTargetsWithin(group(), '#schedule')).toBe(false)
    expect(hashTargetsWithin(group(), '')).toBe(false)
    expect(hashTargetsWithin(group(), '#')).toBe(false)
  })

  it('survives malformed and selector-hostile hashes', () => {
    expect(hashTargetsWithin(group(), '#%E0%A4%A')).toBe(false)
    expect(hashTargetsWithin(group(), '#a"]b')).toBe(false)
  })
})
