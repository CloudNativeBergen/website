import { describe, it, expect } from 'vitest'
import {
  dinnerChoiceId,
  dinnerChoiceOptions,
  resolveDinnerChoice,
  summarizeDinnerChoices,
} from './dinnerChoice'

const routes = [
  { _key: 'taxi', label: 'Taxi from the venue' },
  { _key: 'hike', label: 'Hike' },
]

describe('dinner choice', () => {
  it('has a deterministic id', () => {
    expect(dinnerChoiceId('c1', 's1')).toBe('dinnerChoice.c1.s1')
  })

  it('offers the routes, then own and not coming', () => {
    expect(dinnerChoiceOptions(routes).map((o) => o.value)).toEqual([
      'taxi',
      'hike',
      'own',
      'not-coming',
    ])
  })

  it('reads a removed route key as unset', () => {
    expect(resolveDinnerChoice('boat', routes)).toBeNull()
    expect(resolveDinnerChoice('taxi', routes)).toBe('taxi')
    expect(resolveDinnerChoice('own', undefined)).toBe('own')
    expect(resolveDinnerChoice(null, routes)).toBeNull()
  })

  it('counts confirmed speakers per choice, a removed route on its own row', () => {
    const rows = summarizeDinnerChoices(
      routes,
      [
        { _id: 'a', name: 'Cleo' },
        { _id: 'b', name: 'Ada' },
        { _id: 'c', name: 'Bo' },
        { _id: 'd', name: 'Dee' },
        // A talk referencing a deleted speaker.
        null,
        // Two confirmed talks: counted once.
        { _id: 'b', name: 'Ada' },
      ],
      [
        { speakerId: 'a', choice: 'taxi' },
        { speakerId: 'b', choice: 'taxi' },
        { speakerId: 'c', choice: 'boat' },
        { speakerId: 'd', choice: 'not-coming' },
        // Not a confirmed speaker: not counted.
        { speakerId: 'z', choice: 'hike' },
      ],
    )
    expect(rows.map((r) => [r.label, r.speakers.map((s) => s.name)])).toEqual([
      ['Taxi from the venue', ['Ada', 'Cleo']],
      ['Hike', []],
      ["I'll get there on my own", []],
      ["I'm not coming to the dinner", ['Dee']],
      ['Chose a route that was removed', ['Bo']],
      ['No answer', []],
    ])
  })
})
