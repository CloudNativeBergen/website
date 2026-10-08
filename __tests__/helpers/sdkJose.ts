/**
 * The REAL `jose`, and specifically the copy `@workos-inc/authkit-nextjs`
 * itself depends on — not the suite-wide stub (`__tests__/mocks/jose.ts`) and
 * not the app's own, newer `jose`.
 *
 * Use it as the mock itself, in a suite that runs the SDK unmocked through a
 * path that decodes or verifies a token:
 *
 *     vi.mock('jose', () => import('../../helpers/sdkJose'))
 *
 * A `vi.mock` factory is the only thing that reaches past the resolve-level
 * alias (see `jwt-real-crypto.test.ts`). The package is located through Node's
 * own resolver, started from the SDK's real install path, because any `jose`
 * specifier Vite sees is rewritten to the stub.
 */
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const sdkRequire = createRequire(
  join(
    realpathSync(
      join(process.cwd(), 'node_modules/@workos-inc/authkit-nextjs'),
    ),
    'dist/esm/index.js',
  ),
)

const jose = sdkRequire('jose') as typeof import('jose')

export const {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  SignJWT,
  importJWK,
  importPKCS8,
  importSPKI,
} = jose

/** The version actually loaded, so a suite can state which library it ran. */
export const SDK_JOSE_VERSION = (
  sdkRequire('jose/package.json') as { version: string }
).version
