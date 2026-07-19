import { z } from 'zod'

/**
 * Input for `notification.list`. `before` is a `createdAt` keyset cursor: the
 * `createdAt` of the last item on the previous page. `limit` is bounded so a
 * client can't request an unbounded page.
 */
export const ListNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional(),
  // Alias of `before` for tRPC's `useInfiniteQuery`: its react-query integration
  // injects the value returned by `getNextPageParam` into an input field named
  // literally `cursor`. Keeping `before` as well is backward compatible for
  // direct callers; the router treats `before` as the canonical field and falls
  // back to `cursor`.
  cursor: z.string().datetime().optional(),
})

/**
 * Input for `notification.markRead`. Bounded at 100 ids per call; the data layer
 * additionally verifies each id belongs to the caller before patching.
 */
export const MarkReadSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
})

/**
 * Input for `notification.markReadByLink`. Each link is an APP-RELATIVE deep
 * link (the same `link` a notification carries): it must start with '/' and
 * must not be an absolute/protocol-relative URL or a backslash path. Bounded to
 * 8 links; the data layer additionally scopes patches to the caller's own docs.
 */
export const MarkReadByLinkSchema = z.object({
  links: z
    .array(
      z
        .string()
        .min(1)
        .max(300)
        .refine(
          (link) =>
            link.startsWith('/') &&
            !link.includes('://') &&
            !link.includes('\\'),
          {
            message:
              'Link must be an app-relative path (start with "/", no scheme or backslash)',
          },
        ),
    )
    .min(1)
    .max(8),
})
