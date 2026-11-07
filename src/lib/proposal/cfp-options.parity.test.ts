/**
 * The cfp subgraph copies the site's option catalogues because a Worker
 * cannot import this module's `@/` graph. This pins the copy.
 */
import { describe, expect, it } from 'vitest'
import { audiences, formats, languages, levels } from './types'
import { OPTIONS } from '../../../services/cfp/src/subgraph'

const pairs = (m: Map<string, string>) =>
  [...m].map(([value, label]) => ({ value, label }))

describe('cfp option catalogues', () => {
  it("equal the site's, value and label, in order", () => {
    expect(OPTIONS.formats).toEqual(pairs(formats))
    expect(OPTIONS.levels).toEqual(pairs(levels))
    expect(OPTIONS.languages).toEqual(pairs(languages))
    expect(OPTIONS.audiences).toEqual(pairs(audiences))
  })
})
