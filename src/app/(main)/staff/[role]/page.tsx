import Image from 'next/image'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getStaffMembers } from '@/lib/staff/sanity'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { conferenceTag, organizationTag } from '@/lib/cache/tags'
import { Container } from '@/components/Container'
import { canonicalAlternates } from '@/lib/seo/canonical'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ role: string }>
}): Promise<Metadata> {
  const { role } = await params
  return {
    alternates: await canonicalAlternates(`/staff/${role}`),
  }
}

async function CachedStaffContent({
  domain,
  role,
}: {
  domain: string
  role: string
}) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:staff')

  // Resolve the tenant FROM the domain argument (part of the cache key) — never
  // via request-time `headers()`, which is unavailable inside `'use cache'` and
  // would not participate in the key. This keeps org A's staff from ever being
  // served on org B: the read below is tenant-scoped by `orgId`, and the cache
  // entry is keyed by `domain` and tagged per-tenant so a mutation busts only
  // this tenant's page.
  const { conference } = await getConferenceForDomain(domain)
  const orgId = conference?.organization?._ref ?? null
  if (conference?._id) cacheTag(conferenceTag(conference._id))
  if (orgId) cacheTag(organizationTag(orgId))

  const staff = await getStaffMembers(role, orgId)

  return (
    <>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
        <Container className="relative print:max-w-none print:px-0">
          <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Photographers
          </h1>
          {staff.data.length === 0 && 'No staff found'}
          {staff.data.map((member, index) => {
            return (
              <div
                key={member.id ?? `staff-${index}`}
                className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8"
              >
                <h3 className="font-jetbrains text-3xl font-bold tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
                  {member.name}
                </h3>
                <div className="mt-7 columns-1 gap-6 md:columns-2">
                  <a href={member.link.toString()}>{member.name}</a>
                  <Image
                    src={
                      member.imageURL?.toString() ??
                      'https://placehold.co/800x600/e5e7eb/6b7280?text=Photographer'
                    }
                    alt={member.name}
                    width={800}
                    height={600}
                    className="rounded-md"
                    unoptimized
                  />
                </div>
              </div>
            )
          })}
        </Container>
      </div>
    </>
  )
}

export default async function StaffPage({
  params,
}: {
  params: Promise<{ role: string }>
}) {
  const { role } = await params
  // Read the host OUTSIDE the cached component and pass it in, so the tenant is
  // part of the cache key (the wrapper pattern — see AGENTS.md / homepage).
  const headersList = await headers()
  const domain = headersList.get('host') || ''
  return <CachedStaffContent domain={domain} role={role} />
}
