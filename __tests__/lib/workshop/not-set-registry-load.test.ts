/**
 * @vitest-environment node
 *
 * The not-set notice (#1335) loads the event handler registry only when it has
 * something to raise. `@/lib/workshop/eligibility` is imported by the attendee
 * portal, two admin pages and the ticket-sold webhook; a static import of the
 * registry from there adds every handler in the application to each of them
 * (measured in review: the portal page's local modules went from 145 to 263).
 *
 * This walks STATIC imports only. `__tests__/helpers/serverModuleGraph`
 * follows dynamic ones too, which is the right question for what a route can
 * reach and the wrong one for what it loads up front.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { findRuntimeModuleImports } from '../../helpers/moduleImports'
import {
  REPO_ROOT,
  repoRelative,
  resolveAppModule,
} from '../../helpers/serverModuleGraph'

const REGISTRY = 'src/lib/events/registry.ts'

/** Every app module `entry` loads at import time, as repo-relative paths. */
function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>([join(REPO_ROOT, entry)])
  const queue = [...seen]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const imported of findRuntimeModuleImports(
      readFileSync(file, 'utf8'),
      file,
    )) {
      if (imported.kind === 'dynamic import') continue
      const resolved = resolveAppModule(imported.specifier, file)
      if (!resolved || seen.has(resolved)) continue
      seen.add(resolved)
      queue.push(resolved)
    }
  }
  return new Set([...seen].map(repoRelative))
}

describe('the not-set notice and the handler registry', () => {
  it.each([
    'src/lib/workshop/eligibility.ts',
    'src/app/api/webhooks/checkin/ticket-sold/route.ts',
  ])(
    '%s does not load the registry at import time',
    (entry) => {
      const closure = staticClosure(entry)

      // The walk went somewhere: the module that raises the notice is in it.
      expect(closure).toContain('src/lib/workshop/not-set-notice.ts')
      expect(closure).not.toContain(REGISTRY)
    },
    30_000,
  )

  it('loads it where the notice is raised, by a dynamic import', () => {
    const imports = findRuntimeModuleImports(
      readFileSync(
        join(REPO_ROOT, 'src/lib/workshop/not-set-notice.ts'),
        'utf8',
      ),
    )

    expect(
      imports.filter((imported) => imported.specifier.includes('registry')),
    ).toEqual([
      {
        specifier: '@/lib/events/registry',
        kind: 'dynamic import',
        line: expect.any(Number),
      },
    ])
  })
})
