import { Container } from '@/components/Container'
import type { Conference } from '@/lib/conference/types'
import type { MetricsSection } from '@/lib/homepage'

/**
 * Standalone vanity-metrics band (front-page builder F2). Content comes from the
 * existing `conference.vanityMetrics` source — the same numbers the Hero shows —
 * so a tenant can also surface them lower on the page. Renders nothing when there
 * are no metrics configured.
 */
export function MetricsBlock({
  section,
  conference,
}: {
  section: MetricsSection
  conference: Conference
}) {
  const metrics = conference.vanityMetrics ?? []
  if (metrics.length === 0) return null
  return (
    <section className="py-20 sm:py-32">
      <Container>
        {section.heading ? (
          <h2 className="font-space-grotesk mb-10 text-center text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            {section.heading}
          </h2>
        ) : null}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.slice(0, 6).map((metric) => (
            <div key={metric.label} className="text-center">
              <dt className="font-jetbrains text-sm text-brand-cloud-blue">
                {metric.label}
              </dt>
              <dd className="font-space-grotesk mt-0.5 text-2xl font-semibold tracking-tight text-brand-slate-gray sm:text-3xl dark:text-gray-200">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
