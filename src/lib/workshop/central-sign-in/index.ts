/**
 * Workshop sign-in through one central callback (#1311): the auth host starts
 * the sign-in, takes the callback from WorkOS and hands the result to the
 * tenant host. See `docs/WORKSHOP_CENTRAL_SIGN_IN_SPEC.md`.
 */
export { startCentralSignIn } from './start'
export { finishCentralSignIn } from './callback'
