/**
 * THE ONE PLACE A TEST COMPILES THE REAL SANITY SCHEMA.
 *
 * Why this exists: `validateDocument` returns `[]` — an empty list of markers —
 * when the schema it is handed failed to compile. That is indistinguishable
 * from "this document is valid", so a schema-validation test asserting "no
 * errors here" PASSES VACUOUSLY against a schema that never built. The failure
 * mode is silent and permanent: it survives every later change, because the
 * test can no longer fail for any reason.
 *
 * So every schema test must go through `getCompiledSchema()`, which refuses to
 * hand back a schema that reported compile problems. `__tests__/sanity/
 * schema-compiles.test.ts` asserts the problem list is empty by value, so a
 * broken schema shows up as one named red test rather than a suite that quietly
 * proves nothing.
 *
 * Do not call `createSchema` directly in a test. That is the hazard.
 */
import { createSchema } from 'sanity'
import { inlineSvgInput } from '@starefossen/sanity-plugin-inline-svg-input'
import type { SchemaTypeDefinition } from 'sanity'
import { schema } from '../../sanity/schema'

// `inlineSvg` is registered by a Studio PLUGIN, not by `sanity/schema` — so the
// repo's own type list alone does not compile. Take the type off the plugin
// itself rather than writing a stand-in: a hand-written stub drifts (the one
// this replaced declared an object with an `svg` text field; the real type is a
// plain string), and a test running against a type the Studio does not have
// proves nothing about the Studio.
const pluginTypes = (inlineSvgInput().schema?.types ??
  []) as SchemaTypeDefinition[]

const compiled = createSchema({
  name: 'test',
  types: [...schema.types, ...pluginTypes],
})

/** Compile problems reported by Sanity. Empty means the schema really built. */
export const schemaCompileProblems = compiled._validation ?? []

/** The compiled schema, or a throw — never a schema that validates nothing. */
export function getCompiledSchema() {
  if (schemaCompileProblems.length > 0) {
    throw new Error(
      `the real Sanity schema failed to compile, so validation would be ` +
        `vacuous: ${JSON.stringify(schemaCompileProblems)}`,
    )
  }
  return compiled
}
