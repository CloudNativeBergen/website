import { schema } from '../schema'
import conference from '../schemaTypes/conference'
import organization from '../schemaTypes/organization'
import { buildSchemaTypeRegistry } from './schemaShape'

/**
 * The document types that are APPEND-ONLY because a second application reads
 * them (see `src/lib/conference/contract.ts`).
 *
 * `conference` is read by the kontroll control panel; `organization` is both
 * read and WRITTEN by it. Both are snapshotted against
 * `sanity/schema-shape.baseline.json` by
 * `__tests__/sanity/schema-contract.test.ts`.
 *
 * Adding a document type here is cheap: add it, then run
 * `pnpm tsx scripts/update-schema-baseline.ts`.
 */
export const LOCKED_DOCUMENT_TYPES: Record<string, { name: string }> = {
  conference,
  organization,
}

/**
 * Every registered schema type, indexed by name, so the shape walker can expand
 * a field whose `type` is a separately defined type (`richTextCode` and the
 * rest of the rich-text vocabulary) rather than stopping at the reference.
 * Taken from the SAME list the Studio is built from, so anything registered
 * there is automatically resolvable here.
 */
export const SCHEMA_TYPE_REGISTRY = buildSchemaTypeRegistry(schema.types)

/** Where the committed baseline lives, relative to the repository root. */
export const SCHEMA_SHAPE_BASELINE_PATH = 'sanity/schema-shape.baseline.json'
