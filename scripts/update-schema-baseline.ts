/**
 * Regenerate `sanity/schema-shape.baseline.json` from the real schema modules.
 *
 *   pnpm tsx scripts/update-schema-baseline.ts
 *
 * THE ESCAPE HATCH. `__tests__/sanity/schema-contract.test.ts` fails when a
 * field disappears from, or changes type in, a locked document type — because
 * a second application (kontroll) reads those documents and would break
 * silently at runtime. Running this script accepts the change. Commit the
 * regenerated baseline IN THE SAME PR as the schema edit, so that removing a
 * field is a reviewed act rather than an accident.
 *
 * The baseline is never edited by hand; it is written only from here.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  LOCKED_DOCUMENT_TYPES,
  SCHEMA_SHAPE_BASELINE_PATH,
} from '../sanity/lib/lockedSchemas'
import {
  describeSchemaShape,
  type SchemaShape,
} from '../sanity/lib/schemaShape'

const shapes: Record<string, SchemaShape> = {}
for (const name of Object.keys(LOCKED_DOCUMENT_TYPES).sort()) {
  shapes[name] = describeSchemaShape(LOCKED_DOCUMENT_TYPES[name])
}

const target = resolve(process.cwd(), SCHEMA_SHAPE_BASELINE_PATH)
writeFileSync(target, `${JSON.stringify(shapes, null, 2)}\n`)

for (const [name, shape] of Object.entries(shapes)) {
  console.log(`${name}: ${Object.keys(shape).length} paths`)
}
console.log(`wrote ${SCHEMA_SHAPE_BASELINE_PATH}`)
