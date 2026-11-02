// Materializes services/<name> from its service.cue and
// services/platform-service.cue. Needs the `cue` binary (mise: cue).
// Usage: pnpm scaffold:service <name>
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const name = process.argv[2]
if (!name) {
  console.error('usage: pnpm scaffold:service <name>')
  process.exit(1)
}

const services = join(import.meta.dirname, '..', 'services')
const serviceDir = join(services, name)
const serviceCue = join(serviceDir, 'service.cue')
if (!existsSync(serviceCue)) {
  console.error(`${serviceCue} not found: write a service.cue first`)
  process.exit(1)
}

const out = JSON.parse(
  execFileSync(
    'cue',
    [
      'export',
      join(services, 'platform-service.cue'),
      serviceCue,
      '-e',
      'service',
    ],
    { encoding: 'utf8' },
  ),
) as {
  files: Record<string, unknown>
  sources: Record<string, string>
  stubs: Record<string, string>
}

const write = (path: string, content: string) => {
  mkdirSync(dirname(join(serviceDir, path)), { recursive: true })
  writeFileSync(join(serviceDir, path), content)
}

for (const [path, json] of Object.entries(out.files)) {
  write(path, JSON.stringify(json, null, 2) + '\n')
}
for (const [path, source] of Object.entries(out.sources)) write(path, source)
// Never clobber domain code on re-scaffold.
for (const [path, source] of Object.entries(out.stubs)) {
  if (!existsSync(join(serviceDir, path))) write(path, source)
}
// Generated files must pass `pnpm format:check` as written.
execFileSync(
  'pnpm',
  [
    'exec',
    'prettier',
    '--write',
    ...Object.keys(out.files),
    ...Object.keys(out.sources),
  ],
  { cwd: serviceDir, stdio: 'ignore' },
)

console.log(`scaffolded services/${name}`)
