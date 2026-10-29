/**
 * Side-effect module: the environment the workshop sign-in needs, set before
 * the modules that read it load. The WorkOS client is built once per process
 * from these, and the seal derives its keys from the cookie password.
 */
export const WORKOS_TEST_CLIENT_ID = 'client_test'

process.env.WORKOS_CLIENT_ID = WORKOS_TEST_CLIENT_ID
process.env.WORKOS_API_KEY = 'sk_test_key'
process.env.WORKOS_COOKIE_PASSWORD = 'p'.repeat(48)
