import { buildOnboardingDocuments } from '@/lib/onboarding/create'

/**
 * A tenant EXACTLY as provisioning creates it, built by the REAL
 * `buildOnboardingDocuments` rather than hand-written — so "what a new
 * organizer sees on day one" tests cannot drift away from what provisioning
 * actually writes. Provisioning has changed under these tests before (#833
 * started seeding the starter session formats), and a hand-written fixture
 * would have kept asserting the old world.
 *
 * Callers should still PREMISE-GUARD the specific emptiness they are testing
 * (see `src/lib/settings/activation.test.ts`): if provisioning starts seeding
 * topics or a CFP window, the tests about those states are about a state that
 * no longer exists and should fail loudly rather than quietly pass.
 */
export function buildProvisionedConference(): Record<string, unknown> {
  let key = 0
  const { conference } = buildOnboardingDocuments(
    {
      organization: {
        name: 'Brand New Events',
        slug: 'brand-new-events',
        contactEmail: 'hello@brand-new.example',
      },
      conference: {
        title: 'Brand New Conf',
        city: 'Bergen',
        country: 'Norway',
      },
      organizer: { name: 'Ada Organizer', email: 'ada@brand-new.example' },
      domains: ['brand-new.konf.run'],
    },
    {
      organizationId: 'org-fresh',
      conferenceId: 'conf-fresh',
      speakerId: 'speaker-fresh',
      mintKey: () => `key-${++key}`,
    },
    null,
  )
  return conference
}
