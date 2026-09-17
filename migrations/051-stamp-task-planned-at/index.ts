import { groq } from 'next-sanity'
import { at, defineMigration, patch, setIfMissing } from 'sanity/migrate'
import type { MilestoneSource } from '../../src/lib/marketing/milestones'
import { scopedQuery } from '../../src/lib/sanity/scoped'
import { planStamps, type LegacyTask } from './plan'

/**
 * NOT YET RUN. Adopt legacy anchored Tasks conservatively: stamp the instant
 * their anchor computes from the conference's current dates, never their
 * stored dueAt/scheduledAt. Hand-moved Tasks therefore retain the divergence
 * that excludes them from re-dating. This changes no Task or variant date.
 *
 * Run through the Run Sanity Migration workflow after reviewing its dry run.
 * Each streamed conference supplies its own Milestones and scopes its Task
 * read. Missing anchors and existing stamps are skipped. Revision guards
 * prevent adopting a Task that changed after the read; retry the migration
 * after a conflict. Draft conferences and Tasks are skipped.
 */
export default defineMigration({
  title: 'Stamp legacy marketing Task plannedAt from current Milestone anchors',
  description:
    'Conservatively adopts anchored Tasks by recording their currently computed ' +
    'plan instant, preserving organizer timing overrides and existing stamps.',
  documentTypes: ['conference'],

  async *migrate(documents, context) {
    for await (const conference of documents()) {
      if (
        conference._id.startsWith('drafts.') ||
        conference._id.startsWith('versions.')
      )
        continue
      const conferenceId = conference._id
      const query = scopedQuery(
        { conferenceId },
        groq`*[_type == "marketingTask" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))
          && !defined(plannedAt) && defined(milestone) && defined(offsetDays)]{
          _id, _rev, kind, channel, milestone, offsetDays, plannedAt
        }`,
      )
      const tasks = await context.client.fetch<LegacyTask[]>(query, {
        conferenceId,
      })
      if (tasks.length === 0) continue
      // Invalid required dates fail loudly before this conference's patches.
      const stamps = planStamps(tasks, conference as MilestoneSource)
      for (const stamp of stamps) {
        console.log(`  ${stamp.id}: plannedAt = ${stamp.at}`)
        yield patch(stamp.id, [at('plannedAt', setIfMissing(stamp.at))], {
          ifRevision: stamp.rev,
        })
      }
    }
  },
})
