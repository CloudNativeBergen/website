/**
 * `pnpm run build` for CI, run again when, and only when, it failed because
 * `next/font` could not fetch a Google Font.
 *
 * The root layout declares seven Google Fonts and `next build` downloads each
 * of them. One failed download fails the whole build with a module-not-found
 * error that says nothing about the network, and it has been the most frequent
 * cause of a red "Build" check that a rerun turns green. Any OTHER failure is
 * a real one and is not retried.
 *
 *   pnpm tsx scripts/ci-build.ts
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** How many times the build runs at most. */
export const MAX_ATTEMPTS = 3

/**
 * Did this build fail on a Google Font it could not download? Turbopack
 * reports each one as a module it cannot resolve under this internal path.
 */
export function isFontFetchFailure(output: string): boolean {
  return (
    output.includes('@vercel/turbopack-next/internal/font/google/font') ||
    output.includes('[next]/internal/font/google/')
  )
}

/**
 * What to do after an attempt: `done` on success, `retry` for a font fetch
 * that failed while attempts remain, `fail` for everything else.
 */
export function afterAttempt(
  attempt: number,
  exitCode: number,
  output: string,
): 'done' | 'retry' | 'fail' {
  if (exitCode === 0) return 'done'
  return attempt < MAX_ATTEMPTS && isFontFetchFailure(output) ? 'retry' : 'fail'
}

/** One build, its output passed through as it arrives and kept for the verdict. */
function build(): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    let output = ''
    const child = spawn('pnpm', ['run', 'build'], {
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output }))
  })
}

/**
 * Build until an attempt settles it. Answers the exit code to end with: 0, or
 * the failed build's own. `build` and `wait` are passed in so the loop can be
 * run without a build and without waiting.
 */
export async function runBuilds(
  build: () => Promise<{ exitCode: number; output: string }>,
  wait: (ms: number) => Promise<void>,
): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const { exitCode, output } = await build()
    const next = afterAttempt(attempt, exitCode, output)
    if (next === 'done') return 0
    if (next === 'fail') return exitCode
    // `::warning::` shows on the run's summary, so a retried build is visible.
    console.log(
      `::warning::Build attempt ${attempt} of ${MAX_ATTEMPTS} could not fetch a Google Font; building again.`,
    )
    await wait(attempt * 15_000)
  }
}

async function main(): Promise<void> {
  // `exitCode`, not `exit()`: the build's output is still draining.
  process.exitCode = await runBuilds(
    build,
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main()
}
