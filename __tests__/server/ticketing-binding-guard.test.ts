import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { z } from 'zod'
import { UpdateTicketingIdsSchema } from '@/server/schemas/conference'

/**
 * REPO-WIDE INVARIANT (#745, #2080, #2085):
 *
 * Every tenant shares the platform's ticketing credentials (Checkin / Tito),
 * so allowing a tenant admin to set or change `checkinEventId`,
 * `titoAccountSlug`, or `titoEventSlug` allows them to bind/squat another
 * tenant's event.
 *
 * The D1 conference service (`services/conference/src/data/index.ts`) guards
 * rebinds: only a platform operator (`platform:operator` scope) OR the
 * site server (`site:server` scope) can change these keys.
 *
 * D1 trusts `site:server` because the site router enforces the platform-operator
 * check before persisting any changes to ticketing bindings.
 *
 * FOR THAT TRUST TO HOLD:
 * `UpdateTicketingIdsSchema` must be the ONLY Zod schema anywhere in the site's
 * schemas that accepts any of the vendor binding keys. If any other mutation
 * schema admitted these keys, a tenant admin could submit them through that
 * route and reach D1 with `site:server` scope, bypassing the platform-operator guard.
 */

const VENDOR_BINDING_KEYS = [
  'checkinEventId',
  'titoAccountSlug',
  'titoEventSlug',
] as const

type VendorBindingKey = (typeof VENDOR_BINDING_KEYS)[number]

/** Recursively discover all schema files in src/server/schemas and src/lib/**\/schemas */
function findSchemaFiles(): string[] {
  const root = resolve(__dirname, '../..')
  const files: string[] = []

  const serverSchemasDir = join(root, 'src/server/schemas')
  if (existsSync(serverSchemasDir)) {
    for (const f of readdirSync(serverSchemasDir)) {
      if (
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.spec.ts') &&
        !f.endsWith('.d.ts')
      ) {
        files.push(join(serverSchemasDir, f))
      }
    }
  }

  const libDir = join(root, 'src/lib')
  if (existsSync(libDir)) {
    const scanLib = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'schemas') {
            for (const f of readdirSync(fullPath)) {
              if (
                f.endsWith('.ts') &&
                !f.endsWith('.test.ts') &&
                !f.endsWith('.spec.ts') &&
                !f.endsWith('.d.ts')
              ) {
                files.push(join(fullPath, f))
              }
            }
          } else {
            scanLib(fullPath)
          }
        }
      }
    }
    scanLib(libDir)
  }

  return files.sort()
}

/** Check if an exported value is a Zod schema */
function isZodSchema(val: unknown): val is z.ZodType {
  return (
    val instanceof z.ZodType ||
    (Boolean(val) &&
      typeof val === 'object' &&
      ('_def' in (val as object) || 'def' in (val as object)) &&
      typeof (val as { safeParse?: unknown }).safeParse === 'function')
  )
}

/** Recursively extract all object keys defined at any depth in a Zod schema */
export function extractSchemaKeys(root: unknown): Set<string> {
  const keys = new Set<string>()
  const seen = new Set<unknown>()

  function traverse(schema: unknown) {
    if (!schema || typeof schema !== 'object' || seen.has(schema)) {
      return
    }
    seen.add(schema)

    const def =
      (
        schema as {
          _def?: Record<string, unknown>
          def?: Record<string, unknown>
        }
      )._def ??
      (
        schema as {
          _def?: Record<string, unknown>
          def?: Record<string, unknown>
        }
      ).def

    let shape: Record<string, unknown> | null = null
    const s = schema as { shape?: unknown }
    if (typeof s.shape === 'function') {
      try {
        shape = s.shape() as Record<string, unknown>
      } catch {
        // ignore
      }
    } else if (s.shape && typeof s.shape === 'object') {
      shape = s.shape as Record<string, unknown>
    }
    if (!shape && def?.shape) {
      if (typeof def.shape === 'function') {
        try {
          shape = (def.shape as () => Record<string, unknown>)()
        } catch {
          // ignore
        }
      } else if (typeof def.shape === 'object') {
        shape = def.shape as Record<string, unknown>
      }
    }

    if (shape && typeof shape === 'object') {
      for (const [k, child] of Object.entries(shape)) {
        keys.add(k)
        traverse(child)
      }
    }

    if (def && typeof def === 'object') {
      for (const val of Object.values(def)) {
        if (isZodSchema(val)) {
          traverse(val)
        } else if (Array.isArray(val)) {
          for (const item of val) {
            if (isZodSchema(item)) {
              traverse(item)
            }
          }
        }
      }
      if (
        typeof def.getter === 'function' &&
        (def.getter as () => unknown).length === 0
      ) {
        try {
          traverse((def.getter as () => unknown)())
        } catch {
          // ignore
        }
      }
    }
  }

  traverse(root)
  return keys
}

describe('ticketing binding keys guard (#2085)', () => {
  it('matches the exact vendor binding keys protected by the D1 conference guard', () => {
    const d1IndexPath = resolve(
      __dirname,
      '../../services/conference/src/data/index.ts',
    )
    const content = readFileSync(d1IndexPath, 'utf-8')
    const match = content.match(/const BINDING = \[([\s\S]*?)\]/)
    expect(match).not.toBeNull()
    // Extract string literals from BINDING definition
    const bindingKeys = (match![1].match(/'([^']+)'/g) ?? []).map((s) =>
      s.replace(/'/g, ''),
    )
    expect(bindingKeys.sort()).toEqual([...VENDOR_BINDING_KEYS].sort())
  })

  it('verifies UpdateTicketingIdsSchema contains all vendor binding keys', () => {
    const keys = extractSchemaKeys(UpdateTicketingIdsSchema)
    for (const bindingKey of VENDOR_BINDING_KEYS) {
      expect(
        keys.has(bindingKey),
        `UpdateTicketingIdsSchema must contain '${bindingKey}'`,
      ).toBe(true)
    }
  })

  it('sabotage verification: extractSchemaKeys correctly detects vendor binding keys in schemas', () => {
    const benignSchema = z.object({
      title: z.string(),
      description: z.string(),
    })
    expect(
      [...extractSchemaKeys(benignSchema)].filter((k) =>
        (VENDOR_BINDING_KEYS as readonly string[]).includes(k),
      ),
    ).toEqual([])

    const poisonedSchema = z.object({
      title: z.string(),
      nested: z.object({
        checkinEventId: z.number(),
      }),
    })
    expect(extractSchemaKeys(poisonedSchema).has('checkinEventId')).toBe(true)
  })

  it('asserts ONLY UpdateTicketingIdsSchema contains any vendor binding keys across all schema files', async () => {
    const schemaFiles = findSchemaFiles()
    const root = resolve(__dirname, '../..')

    // Must find multiple schema files
    expect(schemaFiles.length).toBeGreaterThan(10)

    const violations: Array<{
      file: string
      exportName: string
      leakedKeys: string[]
    }> = []

    let totalSchemasChecked = 0
    let updateTicketingIdsSchemaFound = false

    for (const filePath of schemaFiles) {
      const relPath = relative(root, filePath)
      const mod = await import(filePath)

      for (const [exportName, exportedValue] of Object.entries(mod)) {
        if (!isZodSchema(exportedValue)) {
          continue
        }

        totalSchemasChecked++
        const isTargetSchema =
          exportedValue === UpdateTicketingIdsSchema ||
          exportName === 'UpdateTicketingIdsSchema'

        if (isTargetSchema) {
          updateTicketingIdsSchemaFound = true
          continue
        }

        const keys = extractSchemaKeys(exportedValue)
        const leakedKeys = [...VENDOR_BINDING_KEYS].filter((k) => keys.has(k))
        if (leakedKeys.length > 0) {
          violations.push({
            file: relPath,
            exportName,
            leakedKeys,
          })
        }
      }
    }

    expect(
      updateTicketingIdsSchemaFound,
      'UpdateTicketingIdsSchema must be encountered during schema discovery',
    ).toBe(true)
    expect(totalSchemasChecked).toBeGreaterThan(30)
    expect(violations).toEqual([])
  })
})
