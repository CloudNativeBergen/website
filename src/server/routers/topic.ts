import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  TopicCreateSchema,
  TopicUpdateSchema,
  TopicDeleteSchema,
} from '../schemas/topic'
import { defaultTopicColor, slugifyTopicTitle } from '@/lib/topic/create'
import type { Topic } from '@/lib/topic/types'

/**
 * Topic CRUD (SE-2). Topics are standalone documents referenced by
 * `conference.topics[]` and `talk.topics[]`. This router replaces editing them
 * in Sanity Studio; `conference.updateTopics` (the conference router) manages
 * which topics a conference references.
 *
 * DELETE GUARD: a topic that is still referenced by any talk or conference is
 * refused (BAD_REQUEST naming the count) — deleting it would strand those
 * references. The count is read fresh (uncached) so the guard is never stale.
 */

/** Reduce a title to a slug that does not collide with an existing topic. */
async function uniqueTopicSlug(title: string): Promise<string> {
  const base = slugifyTopicTitle(title)
  let candidate = base
  for (let suffix = 2; suffix < 1000; suffix++) {
    const clash = await clientReadUncached.fetch<string | null>(
      `*[_type == "topic" && slug.current == $slug][0]._id`,
      { slug: candidate },
    )
    if (!clash) return candidate
    candidate = `${base.slice(0, 96 - 1 - String(suffix).length)}-${suffix}`
  }
  return `${base.slice(0, 80)}-${Date.now()}`
}

export const topicRouter = router({
  /** Every topic, ordered by title — the pick-list source for the editor. */
  list: adminProcedure.query(async () => {
    const topics = await clientReadUncached.fetch<Topic[]>(
      `*[_type == "topic"] | order(title asc){
        _id,
        _type,
        title,
        description,
        color,
        slug
      }`,
    )
    return topics ?? []
  }),

  create: adminProcedure
    .input(TopicCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const slug = await uniqueTopicSlug(input.title)
        const created = await clientWrite.create({
          _type: 'topic',
          title: input.title,
          color: input.color ?? defaultTopicColor(input.title),
          slug: { _type: 'slug', current: slug },
          ...(input.description ? { description: input.description } : {}),
        })
        revalidateTag('content:conferences', 'default')
        return {
          _id: created._id,
          _type: 'topic' as const,
          title: input.title,
          color: (created.color as string) ?? defaultTopicColor(input.title),
          description: input.description ?? undefined,
          slug: { current: slug },
        } satisfies Topic
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create topic',
          cause: error,
        })
      }
    }),

  update: adminProcedure
    .input(TopicUpdateSchema)
    .mutation(async ({ input }) => {
      const { id, ...rest } = input
      const set: Record<string, unknown> = {}
      const unset: string[] = []
      // Slug is intentionally NOT regenerated on rename — it is a stable public
      // identifier; changing it would break existing topic URLs.
      if (rest.title !== undefined) set.title = rest.title
      if (rest.color !== undefined) set.color = rest.color
      if (rest.description === null) unset.push('description')
      else if (rest.description !== undefined)
        set.description = rest.description

      if (Object.keys(set).length === 0 && unset.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No updates provided',
        })
      }
      try {
        let patch = clientWrite.patch(id)
        if (Object.keys(set).length > 0) patch = patch.set(set)
        if (unset.length > 0) patch = patch.unset(unset)
        await patch.commit()
        revalidateTag('content:conferences', 'default')
        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update topic',
          cause: error,
        })
      }
    }),

  delete: adminProcedure
    .input(TopicDeleteSchema)
    .mutation(async ({ input }) => {
      const [talkCount, conferenceCount] = await Promise.all([
        clientReadUncached.fetch<number>(
          `count(*[_type == "talk" && references($id)])`,
          { id: input.id },
        ),
        clientReadUncached.fetch<number>(
          `count(*[_type == "conference" && references($id)])`,
          { id: input.id },
        ),
      ])
      const talks = talkCount ?? 0
      const conferences = conferenceCount ?? 0
      const total = talks + conferences
      if (total > 0) {
        const parts: string[] = []
        if (talks > 0) parts.push(`${talks} talk${talks === 1 ? '' : 's'}`)
        if (conferences > 0)
          parts.push(`${conferences} conference${conferences === 1 ? '' : 's'}`)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot delete a topic still referenced by ${parts.join(
            ' and ',
          )}. Remove those references first.`,
        })
      }
      try {
        await clientWrite.delete(input.id)
        revalidateTag('content:conferences', 'default')
        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete topic',
          cause: error,
        })
      }
    }),
})
