import { defineMigration, at, set, unset } from 'sanity/migrate'

export default defineMigration({
  title:
    'Clean up pre-existing validation errors across multiple document types',
  description:
    'Fixes 5 categories of data issues: ' +
    '(1) Remove leftover billing/contact_persons from sponsor docs (should have been cleaned by migration 018). ' +
    '(2) Backfill missing contract_status on sponsorForConference docs. ' +
    '(3) Fix invalid activity_type "contract_status_change" → "stage_change" on sponsorActivity docs. ' +
    '(4) Fix speaker slugs stored as strings instead of {_type: "slug", current: "..."} objects. ' +
    '(5) Backfill missing experienceLevel/operatingSystem on workshopSignup docs.',

  documentTypes: [
    'sponsor',
    'sponsorForConference',
    'sponsorActivity',
    'speaker',
    'workshopSignup',
  ],

  migrate: {
    document(doc) {
      const patches = []

      if (doc._type === 'sponsor') {
        const sponsor = doc as unknown as {
          _id: string
          name?: string
          billing?: unknown
          contact_persons?: unknown
        }

        if ('billing' in sponsor || 'contact_persons' in sponsor) {
          if ('billing' in sponsor) {
            patches.push(at('billing', unset()))
          }
          if ('contact_persons' in sponsor) {
            patches.push(at('contact_persons', unset()))
          }
          console.log(
            `  ✓ Removing leftover billing/contact_persons from sponsor ${sponsor.name || sponsor._id}`,
          )
        }
      }

      if (doc._type === 'sponsorForConference') {
        const sfc = doc as unknown as {
          _id: string
          contract_status?: string
        }

        if (!sfc.contract_status) {
          patches.push(at('contract_status', set('none')))
          console.log(
            `  ✓ Setting contract_status to "none" on sponsorForConference ${sfc._id}`,
          )
        }
      }

      if (doc._type === 'sponsorActivity') {
        const activity = doc as unknown as {
          _id: string
          activity_type?: string
        }

        if (activity.activity_type === 'contract_status_change') {
          patches.push(at('activity_type', set('stage_change')))
          console.log(
            `  ✓ Fixing activity_type "contract_status_change" → "stage_change" on ${activity._id}`,
          )
        }
      }

      if (doc._type === 'speaker') {
        const speaker = doc as unknown as {
          _id: string
          name?: string
          slug?: string | { _type: string; current: string }
        }

        if (typeof speaker.slug === 'string') {
          patches.push(
            at('slug', set({ _type: 'slug', current: speaker.slug })),
          )
          console.log(
            `  ✓ Converting string slug "${speaker.slug}" to object on speaker ${speaker.name || speaker._id}`,
          )
        }
      }

      if (doc._type === 'workshopSignup') {
        const signup = doc as unknown as {
          _id: string
          experienceLevel?: string
          operatingSystem?: string
        }

        if (!signup.experienceLevel) {
          patches.push(at('experienceLevel', set('unknown')))
        }
        if (!signup.operatingSystem) {
          patches.push(at('operatingSystem', set('unknown')))
        }
        if (patches.length > 0) {
          console.log(
            `  ✓ Backfilling missing experienceLevel/operatingSystem on workshopSignup ${signup._id}`,
          )
        }
      }

      return patches
    },
  },
})
