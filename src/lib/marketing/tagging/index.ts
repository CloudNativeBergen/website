/*
 * Tests and callers outside `src/lib/marketing` use this barrel. Modules
 * inside it import `./tagging/body` and `./tagging/lookup` directly: seeding
 * (and so `materialize.ts`) is imported by admin stories, and this barrel
 * pulls in the network resolver.
 */
export { blueskyHandleFromLinks } from './handle'
export {
  resolveBlueskyHandle,
  RESOLVE_TIMEOUT_MS,
  type HandleResolution,
} from './resolve'
export {
  BLUESKY_MAX_GRAPHEMES,
  joinNames,
  tagBlueskyBody,
  tagsItsSubject,
  type BlueskyTag,
  type MentionRecord,
  type TagPerson,
} from './body'
export { blueskyTagFor, ownBlueskyHandle, type TagSource } from './lookup'
export { TAG_SUBJECT_SWITCHABLE } from './rollout'
