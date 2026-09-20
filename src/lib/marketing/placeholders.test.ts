import { describe, expect, it } from 'vitest'
import { CONFERENCE_PLACEHOLDERS, unknownTokens } from './placeholders'

describe('unknownTokens', () => {
  it('accepts every conference placeholder', () => {
    expect(
      unknownTokens(
        '{event} {date} {venue} {city} {url} {eventTag}',
        CONFERENCE_PLACEHOLDERS,
      ),
    ).toEqual([])
  })
  it('reports a subject placeholder a static Task can never fill in', () => {
    expect(
      unknownTokens(
        'Hi {name}, see you at {venue} — {company}',
        CONFERENCE_PLACEHOLDERS,
      ),
    ).toEqual(['{name}', '{company}'])
  })
  it('reports each unknown token once', () => {
    expect(unknownTokens('{days} and {days}', CONFERENCE_PLACEHOLDERS)).toEqual(
      ['{days}'],
    )
  })
  it('leaves prose braces alone', () => {
    expect(unknownTokens('a {1} b { } c', CONFERENCE_PLACEHOLDERS)).toEqual([])
  })
})
