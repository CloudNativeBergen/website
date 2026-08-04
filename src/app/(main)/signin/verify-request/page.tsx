import type { Metadata } from 'next'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * The single "check your email" page.
 *
 * It takes NO parameters — not the address, not a status. Every outcome of a
 * link request lands here identically: address unknown, address known, address
 * malformed, rate limit exceeded, mail provider rejected the send. Anything
 * this page could say about the specific request would be an enumeration
 * signal, so it says nothing about it.
 */
export default function VerifyRequest() {
  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center lg:px-12">
          <h1 className="font-display text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
            Check your email
          </h1>
          <p className="mt-6 text-lg text-brand-slate-gray dark:text-gray-300">
            If that address can sign in, a link is on its way. Open it on this
            device to finish signing in.
          </p>
          <p className="mt-4 text-base text-brand-slate-gray dark:text-gray-400">
            The link expires shortly, so use it soon. Nothing arrived? Check
            your spam folder, then{' '}
            <a
              href="/signin"
              className="font-semibold text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover dark:text-blue-400"
            >
              request another one
            </a>
            .
          </p>
        </div>
      </Container>
    </div>
  )
}
