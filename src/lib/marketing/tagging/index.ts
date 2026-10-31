/*
 * Tests and callers outside `src/lib/marketing` use this barrel. Modules
 * inside it import `./tagging/body` and `./tagging/lookup` directly: seeding
 * (and so `materialize.ts`) is imported by admin stories, and this barrel
 * pulls in the network resolver.
 */
export { blueskyHandleFromLinks } from './handle'
export { resolveBlueskyHandle, RESOLVE_TIMEOUT_MS } from './resolve'
export { joinNames, speakersList, tagBlueskyBody } from './body'
