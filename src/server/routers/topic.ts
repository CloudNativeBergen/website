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
import {
  getOrganizationRefForCurrentConference,
  organizationField,
} from '@/lib/organization/sanity'
import { requireCurrentOrgId, requireDocumentInCurrentOrg } from '../tenancy'

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
  /** This tenant's topics, ordered by title — the pick-list source for the
   * editor. Scoped to the current org (E3); org-less legacy topics (pre-044
   * backfill) still appear via the coalesce fallback so nothing vanishes before
   * the backfill. When the org is unresolvable (legacy domain), all topics show
   * — the same migration bridge used elsewhere. */
  list: adminProcedure.query(async () => {
    // FAIL CLOSED (#730). This previously fell back to a bare
    // `_type == "topic"` when the org did not resolve — every tenant's topics,
    // to any admin on an unrecognised host. It was written as a migration
    // bridge for legacy domains, which is the same shape as the organizer-set
    // and travel-support fallbacks that turned out to be live leaks.
    //
    // The `!defined(organization)` tolerance is gone for the same reason: it
    // showed every un-backfilled topic to every tenant. Migration 044 has been
    // confirmed applied, so nothing is stranded by requiring the key.
    const orgRef = await getOrganizationRefForCurrentConference()
    if (!orgRef) return []

    const topics = await clientReadUncached.fetch<Topic[]>(
      // groq-global-scoped: the tenant predicate is `organization._ref ==
      // $orgId`, bound below; the early return above guarantees it is present.
      `*[_type == "topic" && organization._ref == $orgId] | order(title asc){
        _id,
        _type,
        title,
        description,
        color,
        slug
      }`,
      { orgId: orgRef },
    )
    return topics ?? []
  }),

  create: adminProcedure
    .input(TopicCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const slug = await uniqueTopicSlug(input.title)
        // Stamp the current conference's organization (CaaS T1-1) so the topic
        // is born tenant-owned. FAIL CLOSED (#730): an org-less topic is owned
        // by no tenant and the ownership guard on update/delete would refuse it
        // forever — refuse the create rather than strand it.
        const orgRef = await requireCurrentOrgId()
        const created = await clientWrite.create({
          _type: 'topic',
          title: input.title,
          color: input.color ?? defaultTopicColor(input.title),
          slug: { _type: 'slug', current: slug },
          ...(input.description ? { description: input.description } : {}),
          ...organizationField(orgRef),
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
        // OWNERSHIP (#730): `id` is client input. Without this the patch would
        // rewrite ANY document in the shared dataset — another tenant's topic,
        // or (no `_type` check either) their `conference` document.
        await requireDocumentInCurrentOrg(id, 'topic')
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
      // OWNERSHIP (#730) FIRST, before the reference probe: `input.id` is client
      // input, and the reference guard alone let a caller delete any document
      // nothing happens to reference — including another tenant's.
      await requireDocumentInCurrentOrg(input.id, 'topic')
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
