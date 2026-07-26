import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import type { CtaBannerSection } from '@/lib/homepage'

/**
 * Generic call-to-action banner block (front-page builder F2). A closed-registry
 * primitive: heading + optional body + exactly ONE house {@link Button}. No raw
 * HTML — the copy and destination are the only tenant-controlled inputs.
 */
export function CtaBanner({ section }: { section: CtaBannerSection }) {
  const { heading, body, buttonLabel, buttonHref } = section
  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-space-grotesk text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400">
            {heading}
          </h2>
          {body ? (
            <p className="font-inter mt-4 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300">
              {body}
            </p>
          ) : null}
          {buttonLabel && buttonHref ? (
            <div className="mt-10 flex justify-center">
              <Button
                href={buttonHref}
                variant="primary"
                className="inline-flex items-center space-x-2 px-8 py-4 font-semibold"
              >
                <span>{buttonLabel}</span>
              </Button>
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  )
}
