import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import {
  DocumentTextIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  BookOpenIcon,
  CalendarIcon,
  XCircleIcon,
  ScaleIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  title: 'Terms of Service - Cloud Native Days',
  description:
    'Terms of Service for Cloud Native Days conference and workshop services',
}

async function CachedTermsContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('max')
  cacheTag('content:terms')

  const { conference, error: conferenceError } =
    await getConferenceForDomain(domain)

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  const lastUpdated = 'October 31, 2025'
  const contactEmail = conference.contact_email || 'contact@cloudnativedays.no'
  const organizationName = conference.organizer || 'Cloud Native Days'

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24 print:py-8">
        <BackgroundImage className="-top-36 -bottom-14 print:hidden" />
        <Container className="relative print:max-w-none print:px-0">
          <div className="mx-auto max-w-4xl print:max-w-none">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400 print:mb-4 print:text-3xl print:font-bold print:text-black">
              Terms of Service
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300 print:mt-4 print:space-y-4 print:text-base print:text-black">
              <p className="print:leading-relaxed">
                Welcome to {organizationName}. These Terms of Service govern
                your use of our website, workshop registration system, speaker
                submission platform, and related services.
              </p>
              <p className="print:leading-relaxed">
                By accessing or using our services, you agree to be bound by
                these terms. Please read them carefully.
              </p>
              <p className="text-xl tracking-tight print:text-base print:font-semibold">
                <strong>Last updated:</strong> {lastUpdated}
              </p>
            </div>
          </div>

          <div className="mx-auto mt-16 max-w-4xl rounded-xl border border-brand-frosted-steel bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:shadow-gray-900/20 print:mt-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
            <div className="prose prose-lg dark:prose-invert print:prose-base max-w-none print:max-w-none">
              <div className="space-y-8 print:space-y-6">
                {/* Section 1: Acceptance of Terms */}
                <section id="acceptance" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <DocumentTextIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mb-3 print:text-xl print:font-bold print:text-black">
                      1. Acceptance of Terms
                    </h2>
                  </div>
                  <div className="space-y-4 print:space-y-3">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300 print:leading-relaxed print:text-black">
                      By creating an account, registering for workshops,
                      submitting a talk proposal, or otherwise using our
                      services, you acknowledge that you have read, understood,
                      and agree to be bound by these Terms of Service and our{' '}
                      <Link
                        href="/privacy"
                        className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Privacy Policy
                      </Link>
                      .
                    </p>
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      If you do not agree with any part of these terms, you may
                      not use our services.
                    </p>
                  </div>
                </section>

                {/* Section 2: User Accounts and Authentication */}
                <section id="accounts" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <UserGroupIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      2. User Accounts and Authentication
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <h3 className="mb-3 font-semibold text-blue-800 dark:text-blue-200">
                        Account Creation
                      </h3>
                      <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                        <li>
                          • You may create an account using GitHub or LinkedIn
                          (for Call for Papers) or WorkOS AuthKit (for workshop
                          registration)
                        </li>
                        <li>
                          • You must provide accurate and complete information
                          when creating an account
                        </li>
                        <li>
                          • You are responsible for maintaining the security of
                          your account
                        </li>
                        <li>
                          • You must be at least 13 years old to create an
                          account and use our services
                        </li>
                        <li>
                          • One person may not maintain multiple accounts for
                          the same purpose
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                      <h3 className="mb-3 font-semibold text-orange-800 dark:text-orange-200">
                        Account Responsibilities
                      </h3>
                      <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-300">
                        <li>
                          • You are responsible for all activities that occur
                          under your account
                        </li>
                        <li>
                          • You must notify us immediately of any unauthorized
                          use of your account
                        </li>
                        <li>
                          • We reserve the right to suspend or terminate
                          accounts that violate these terms
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Section 3: Workshop Registration */}
                <section id="workshops" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <BookOpenIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      3. Workshop Registration
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                      <h3 className="mb-3 font-semibold text-amber-800 dark:text-amber-200">
                        Registration Process
                      </h3>
                      <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                        <li>
                          • Workshop registration requires authentication
                          through WorkOS AuthKit
                        </li>
                        <li>
                          • Workshops have limited capacity and are assigned on
                          a first-come, first-served basis
                        </li>
                        <li>
                          • Confirmed registrations may be subject to waitlist
                          if capacity is reached
                        </li>
                        <li>
                          • You will receive a confirmation email upon
                          successful registration
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                      <h3 className="mb-3 flex items-center font-semibold text-red-800 dark:text-red-200">
                        <XCircleIcon className="mr-2 h-5 w-5" />
                        Cancellation Policy
                      </h3>
                      <ul className="space-y-2 text-sm text-red-700 dark:text-red-300">
                        <li>
                          • You may cancel your workshop registration at any
                          time through the workshop page
                        </li>
                        <li>
                          • Cancellations will open spots for waitlisted
                          participants
                        </li>
                        <li>
                          • We reserve the right to cancel workshops due to low
                          enrollment or unforeseen circumstances
                        </li>
                        <li>
                          • No-shows may be restricted from future workshop
                          registrations
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                      <h3 className="mb-3 font-semibold text-green-800 dark:text-green-200">
                        Participant Conduct
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        All workshop participants must adhere to our Code of
                        Conduct. Disruptive or inappropriate behavior may result
                        in removal from the workshop and conference without
                        refund.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 4: Speaker Submissions (Call for Papers) */}
                <section id="cfp" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <CalendarIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      4. Speaker Submissions (Call for Papers)
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                      <h3 className="mb-3 font-semibold text-purple-800 dark:text-purple-200">
                        Submission Requirements
                      </h3>
                      <ul className="space-y-2 text-sm text-purple-700 dark:text-purple-300">
                        <li>• All submissions must be original work</li>
                        <li>
                          • You warrant that you have the right to present the
                          submitted content
                        </li>
                        <li>
                          • Submissions are subject to review and acceptance by
                          the program committee
                        </li>
                        <li>
                          • Accepted speakers agree to have their talks recorded
                          and published
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <h3 className="mb-3 font-semibold text-blue-800 dark:text-blue-200">
                        Content Rights and Licensing
                      </h3>
                      <p className="mb-2 text-sm text-blue-700 dark:text-blue-300">
                        By submitting a talk proposal and speaking at our
                        conference, you grant {organizationName}:
                      </p>
                      <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                        <li>
                          • A non-exclusive, worldwide, perpetual license to
                          record, reproduce, and distribute your presentation
                        </li>
                        <li>
                          • The right to publish your talk on our website and
                          official video platforms
                        </li>
                        <li>
                          • The right to use your name, biography, and
                          photograph in promotional materials
                        </li>
                      </ul>
                      <p className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                        You retain all other rights to your content and may use
                        it elsewhere as you wish.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 5: Acceptable Use */}
                <section
                  id="acceptable-use"
                  className="space-y-6 print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <ShieldCheckIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      5. Acceptable Use
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      You agree not to:
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Violate any applicable laws or regulations
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Infringe on intellectual property rights
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Transmit malicious code or viruses
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Harass, abuse, or harm other users
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Attempt unauthorized access to systems
                        </p>
                      </div>
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                          • Use automated tools to scrape content
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 6: Intellectual Property */}
                <section id="ip" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <ScaleIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      6. Intellectual Property
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      All content on our website, including but not limited to
                      text, graphics, logos, images, and software, is the
                      property of {organizationName} or its content suppliers
                      and is protected by international copyright laws.
                    </p>
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      You may not reproduce, distribute, modify, or create
                      derivative works without our express written permission.
                    </p>
                  </div>
                </section>

                {/* Section 7: Disclaimers and Limitations of Liability */}
                <section id="disclaimers" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <ExclamationTriangleIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      7. Disclaimers and Limitations of Liability
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                      <h3 className="mb-3 font-semibold text-yellow-800 dark:text-yellow-200">
                        Service &quot;As Is&quot;
                      </h3>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                        Our services are provided &quot;as is&quot; and &quot;as
                        available&quot; without any warranties of any kind,
                        either express or implied. We do not warrant that the
                        service will be uninterrupted, timely, secure, or
                        error-free.
                      </p>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                      <h3 className="mb-3 font-semibold text-orange-800 dark:text-orange-200">
                        Limitation of Liability
                      </h3>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        To the maximum extent permitted by law,{' '}
                        {organizationName} shall not be liable for any indirect,
                        incidental, special, consequential, or punitive damages,
                        including but not limited to loss of profits, data, or
                        other intangible losses resulting from your use of our
                        services.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 8: Indemnification */}
                <section
                  id="indemnification"
                  className="space-y-6 print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <ScaleIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      8. Indemnification
                    </h2>
                  </div>
                  <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                    You agree to indemnify, defend, and hold harmless{' '}
                    {organizationName}, its officers, directors, employees, and
                    agents from any claims, liabilities, damages, losses, and
                    expenses arising from your violation of these Terms of
                    Service or your use of our services.
                  </p>
                </section>

                {/* Section 9: Changes to Terms */}
                <section id="changes" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <DocumentTextIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      9. Changes to Terms
                    </h2>
                  </div>
                  <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                    We reserve the right to modify these Terms of Service at any
                    time. We will notify users of significant changes via email
                    or through a notice on our website. Your continued use of
                    our services after such modifications constitutes acceptance
                    of the updated terms.
                  </p>
                </section>

                {/* Section 10: Governing Law */}
                <section
                  id="governing-law"
                  className="space-y-6 print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <GlobeAltIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      10. Governing Law and Dispute Resolution
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      These Terms of Service are governed by and construed in
                      accordance with the laws of Norway. Any disputes arising
                      from these terms or your use of our services shall be
                      subject to the exclusive jurisdiction of the courts of
                      Norway.
                    </p>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Before pursuing formal legal action, we encourage users
                        to contact us to resolve disputes amicably.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 11: Contact Information */}
                <section id="contact" className="space-y-6 print:space-y-4">
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <BanknotesIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      11. Contact Information
                    </h2>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      If you have any questions about these Terms of Service,
                      please contact us at:{' '}
                      <a
                        href={`mailto:${contactEmail}`}
                        className="font-semibold underline hover:text-blue-900 dark:hover:text-blue-200"
                      >
                        {contactEmail}
                      </a>
                    </p>
                  </div>
                </section>

                <hr className="my-8 print:my-4 print:border-black" />

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    By using {organizationName}&apos;s services, you acknowledge
                    that you have read and understood these Terms of Service and
                    agree to be bound by them. These terms work in conjunction
                    with our{' '}
                    <Link
                      href="/privacy"
                      className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Privacy Policy
                    </Link>{' '}
                    to govern your use of our platform.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>
    </>
  )
}

export default async function TermsPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedTermsContent domain={domain} />
}
