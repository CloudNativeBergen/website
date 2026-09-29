/** The organizer surface every social deep link lands on. */
export const SOCIAL_POSTS_PATH = '/admin/marketing/posts'

/**
 * The copy-ready view for one variant: the posts page with the manual
 * dialog opened on it (`SocialPostsManager` reads the `variant` query).
 * Client-safe, so the Task editor links where the notifications link.
 */
export function manualPostPath(variantId: string): string {
  return `${SOCIAL_POSTS_PATH}?variant=${encodeURIComponent(variantId)}`
}
