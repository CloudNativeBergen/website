/**
 * Side-effect module: the environment of `./workosEnv` WITHOUT a redirect URI
 * in it — the shape production has once `NEXT_PUBLIC_WORKOS_REDIRECT_URI` and
 * `WORKOS_REDIRECT_URI` are removed (#1299). Import it FIRST, as with
 * `./workosEnv`: the SDK captures its configuration when it loads.
 */
import './workosEnv'

delete process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI
delete process.env.WORKOS_REDIRECT_URI
