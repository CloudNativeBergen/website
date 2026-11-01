/**
 * @vitest-environment node
 *
 * #848: a failed proposals read on `/cfp/list` must surface as an error with a
 * retry, not as "You haven't submitted any proposals yet". The page is a large
 * server component, so (like `scoping.test.ts`) this is a source-level
 * tripwire.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const code = readFileSync(
  join(process.cwd(), 'src/app/(cfp)/cfp/list/page.tsx'),
  'utf8',
).replace(/^\s*\/\/.*$/gm, '')

describe('/cfp/list proposals error', () => {
  it('reads proposalsError instead of dropping it', () => {
    expect(code).toContain('{ proposals, proposalsError }')
    expect(code).toContain('proposalsFailed: Boolean(proposalsError)')
  })

  it('shows the error banner in place of the empty state', () => {
    expect(code).toContain('{proposalsErrorBanner ?? (')
    expect(code).toContain('Try again')
  })
})
