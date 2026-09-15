/**
 * The guard against vacuous schema-validation passes (#1032).
 *
 * `validateDocument` returns `[]` for a schema that failed to compile, which
 * reads exactly like "no validation problems". Without this test, a broken
 * schema turns every document-validation test green instead of red. Here the
 * assertion is on a VALUE — the compile problem list — so it cannot be
 * satisfied by an absence.
 */
import { describe, it, expect } from 'vitest'
import { getCompiledSchema, schemaCompileProblems } from './realSchema'

describe('the real Sanity schema', () => {
  it('compiles with no validation problems', () => {
    expect(schemaCompileProblems).toEqual([])
  })

  it('resolves inlineSvg, the type the Studio plugin registers', () => {
    // Guards the seam this test helper papers over: if the plugin stops
    // supplying the type, every schema test would otherwise go vacuous again.
    expect(getCompiledSchema().get('inlineSvg')).toBeTruthy()
  })
})
