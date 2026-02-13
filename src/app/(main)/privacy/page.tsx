import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ContentCard } from '@/components/ContentCard'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import {
  ShieldCheckIcon,
  DocumentTextIcon,
  UserGroupIcon,
  GlobeAltIcon,
  ScaleIcon,
  BanknotesIcon,
  ChatBubbleLeftRightIcon,
  CogIcon,
  EnvelopeIcon,
  ChartBarIcon,
  BuildingOfficeIcon,
  ClockIcon,
  LockClosedIcon,
  EyeIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  PhoneIcon,
  PencilIcon,
  PauseIcon,
  ArrowUpTrayIcon,
  NoSymbolIcon,
  UserIcon,
  VideoCameraIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckIcon,
  ChatBubbleOvalLeftIcon,
  FlagIcon,
  HandRaisedIcon,
  UserMinusIcon,
} from '@heroicons/react/24/outline'
import { cacheLife, cacheTag } from 'next/cache'
import { headers } from 'next/headers'

export const metadata = {
  title: 'Privacy Policy - Cloud Native Days Norway',
  description:
    'Privacy policy and data protection information for Cloud Native Days Norway conference',
}

async function CachedPrivacyContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('max')
  cacheTag('content:privacy')

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
  const contactEmail = conference.contactEmail || 'contact@cloudnativedays.no'
  const organizationName = 'Cloud Native Days Norway'

  return (
    <>
      <div className="relative py-20 sm:pt-36 sm:pb-24 print:py-8">
        <BackgroundImage className="-top-36 -bottom-14 print:hidden" />
        <Container className="relative print:max-w-none print:px-0">
          <div className="mx-auto max-w-4xl print:max-w-none">
            <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400 print:mb-4 print:text-3xl print:font-bold print:text-black">
              Privacy Policy
            </h1>
            <div className="font-inter mt-6 space-y-6 text-xl tracking-tight text-brand-slate-gray dark:text-gray-300 print:mt-4 print:space-y-4 print:text-base print:text-black">
              <p className="print:leading-relaxed">
                We collect your information to organize conferences and manage
                speaker applications, using privacy-friendly analytics to
                improve our website. We&apos;re committed to protecting your
                data and never sell your personal information to third parties.
              </p>
              <p className="print:leading-relaxed">
                This policy explains what data we collect, how we use it, and
                your rights under GDPR. We only gather information necessary for
                conference operations, speaker coordination, and providing you
                with the best possible event experience.
              </p>
              <p className="text-xl tracking-tight print:text-base print:font-semibold">
                <strong>Last updated:</strong> {lastUpdated}
              </p>
            </div>
          </div>

          <ContentCard>
            <div className="prose prose-lg dark:prose-invert print:prose-base max-w-none print:max-w-none">
              <div className="space-y-8 print:space-y-6">
                {/* Section 1: Who We Are */}
                <section
                  id="who-we-are"
                  className="space-y-6 print:break-before-page print:break-inside-avoid print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <BuildingOfficeIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400 print:mb-3 print:text-xl print:font-bold print:text-black">
                      1. Who We Are
                    </h2>
                  </div>{' '}
                  <div className="space-y-4 print:space-y-3">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300 print:leading-relaxed print:text-black">
                      {organizationName} is a technology conference organizer
                      based in Bergen, Norway. We organize events focused on
                      cloud native technologies and related topics.
                    </p>

                    <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50 print:border print:border-gray-300 print:bg-white print:p-3">
                      <div className="space-y-2 text-sm print:space-y-1 print:text-base">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white print:text-black">
                            Data Controller:
                          </span>{' '}
                          <span className="text-gray-700 dark:text-gray-300 print:text-black">
                            {organizationName}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white print:text-black">
                            Contact:
                          </span>{' '}
                          <span className="text-gray-700 dark:text-gray-300 print:text-black">
                            {contactEmail}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            Location:
                          </span>{' '}
                          <span className="text-gray-700 dark:text-gray-300">
                            Bergen, Norway
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 2: What Personal Data We Collect */}
                <section
                  id="personal-data-collection"
                  className="space-y-6 print:break-before-page print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <DocumentTextIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      2. What Personal Data We Collect
                    </h2>
                  </div>{' '}
                  <div className="space-y-6">
                    {/* Speaker Information */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-blue-800 dark:text-blue-200">
                        <UserGroupIcon className="mr-3 h-5 w-5" />
                        Speaker Information
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 font-medium text-blue-800 dark:text-blue-200">
                            Contact & Professional
                          </h4>
                          <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                            <li>• Name, email address, professional title</li>
                            <li>• Biography and company affiliation</li>
                            <li>
                              • Social media links and professional profiles
                            </li>
                            <li>• Profile photos and presentation history</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-medium text-blue-800 dark:text-blue-200">
                            Authentication & Diversity
                          </h4>
                          <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
                            <li>
                              • GitHub/LinkedIn profile information (when
                              signing in)
                            </li>
                            <li>
                              • Optional diversity and inclusion details
                              (special category data, collected only with your
                              explicit consent)
                            </li>
                            <li>• Local speaker status (optional)</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Travel Support */}
                    <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-green-800 dark:text-green-200">
                        <BanknotesIcon className="mr-3 h-5 w-5" />
                        Travel Support Information{' '}
                        <span className="ml-2 text-sm font-normal">
                          (When Applicable)
                        </span>
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 font-medium text-green-800 dark:text-green-200">
                            Financial Details
                          </h4>
                          <ul className="space-y-1 text-sm text-green-700 dark:text-green-300">
                            <li>• Beneficiary name and bank information</li>
                            <li>• IBAN/account number and SWIFT code</li>
                            <li>• Travel expense amounts and currencies</li>
                            <li>• Receipts and travel documentation</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-medium text-green-800 dark:text-green-200">
                            Travel Information
                          </h4>
                          <ul className="space-y-1 text-sm text-green-700 dark:text-green-300">
                            <li>• Expense descriptions and categories</li>
                            <li>• Travel locations and dates</li>
                            <li>• Supporting documentation</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Workshop Registration */}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-amber-800 dark:text-amber-200">
                        <BookOpenIcon className="mr-3 h-5 w-5" />
                        Workshop Registration{' '}
                        <span className="ml-2 text-sm font-normal">
                          (For Workshop Participants)
                        </span>
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 font-medium text-amber-800 dark:text-amber-200">
                            Registration Details
                          </h4>
                          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                            <li>• Full name and email address</li>
                            <li>• Workshop preferences and selections</li>
                            <li>
                              • Experience level (beginner, intermediate,
                              advanced)
                            </li>
                            <li>
                              • Operating system preference (Windows, macOS,
                              Linux)
                            </li>
                            <li>
                              • WorkOS User ID (unique authentication
                              identifier)
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-medium text-amber-800 dark:text-amber-200">
                            Workshop Management
                          </h4>
                          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                            <li>
                              • Workshop signup status (confirmed, waitlist)
                            </li>
                            <li>• Signup date and confirmation details</li>
                            <li>• Workshop attendance tracking</li>
                            <li>• Capacity and waitlist management</li>
                            <li>
                              • Authentication session data for workshop access
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Communication Data */}
                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-6 dark:border-purple-800 dark:bg-purple-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-purple-800 dark:text-purple-200">
                        <ChatBubbleLeftRightIcon className="mr-3 h-5 w-5" />
                        Communication Data
                      </h3>
                      <ul className="space-y-2 text-sm text-purple-700 dark:text-purple-300">
                        <li>
                          • <strong>Email Communications:</strong> Messages
                          between organizers and speakers
                        </li>
                        <li>
                          • <strong>Conference Updates:</strong> Information
                          about conference logistics and updates
                        </li>
                        <li>
                          • <strong>Workshop Notifications:</strong> Signup
                          confirmations, waitlist updates, and workshop-related
                          announcements
                        </li>
                      </ul>
                    </div>

                    {/* Photo Gallery Data */}
                    <div className="rounded-lg border border-pink-200 bg-pink-50 p-6 dark:border-pink-800 dark:bg-pink-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-pink-800 dark:text-pink-200">
                        <VideoCameraIcon className="mr-3 h-5 w-5" />
                        Photo Gallery & Event Documentation
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 font-medium text-pink-800 dark:text-pink-200">
                            Photo Tagging
                          </h4>
                          <ul className="space-y-1 text-sm text-pink-700 dark:text-pink-300">
                            <li>
                              • Speaker and attendee identification in event
                              photos
                            </li>
                            <li>
                              • Photo metadata (photographer, location, date)
                            </li>
                            <li>
                              • Untagging history (speakers who removed
                              themselves from photos)
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-medium text-pink-800 dark:text-pink-200">
                            Your Control
                          </h4>
                          <ul className="space-y-1 text-sm text-pink-700 dark:text-pink-300">
                            <li>
                              • Remove yourself from any photo at any time
                            </li>
                            <li>
                              • Prevents automatic re-tagging in that photo
                            </li>
                            <li>
                              • Your removal choice is permanently respected
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg bg-pink-100 p-2 dark:bg-pink-800/30">
                        <p className="text-xs text-pink-800 dark:text-pink-200">
                          <strong>Legal Basis:</strong> Legitimate interest for
                          event documentation and community engagement. You can
                          untag yourself at any time through your speaker
                          profile or by contacting us.
                        </p>
                      </div>
                    </div>

                    {/* Attendee & Participant Information */}
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-800 dark:bg-indigo-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-indigo-800 dark:text-indigo-200">
                        <UserGroupIcon className="mr-3 h-5 w-5" />
                        Attendee & Participant Information
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 font-medium text-indigo-800 dark:text-indigo-200">
                            Registration Details
                          </h4>
                          <ul className="space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
                            <li>• Full name and email address</li>
                            <li>• Company/organization affiliation</li>
                            <li>• Professional title and experience level</li>
                            <li>
                              • Dietary requirements and accessibility needs
                              <span className="ml-1 text-indigo-600 dark:text-indigo-300">
                                (may include health data; collected with your
                                explicit consent and used only to accommodate
                                your needs)
                              </span>
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-medium text-indigo-800 dark:text-indigo-200">
                            Event Management
                          </h4>
                          <ul className="space-y-1 text-sm text-indigo-700 dark:text-indigo-300">
                            <li>• Check-in and attendance tracking</li>
                            <li>• Session preferences and interests</li>
                            <li>• Networking preferences (optional)</li>
                            <li>• Emergency contact information</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Website Usage (Analytics) */}
                    <div className="rounded-lg border border-teal-200 bg-teal-50 p-6 dark:border-teal-800 dark:bg-teal-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-teal-800 dark:text-teal-200">
                        <ChartBarIcon className="mr-3 h-5 w-5" />
                        Website Usage (Analytics)
                      </h3>
                      <ul className="space-y-2 text-sm text-teal-700 dark:text-teal-300">
                        <li>
                          • Page views, referrers, device/browser information,
                          approximate region
                        </li>
                        <li>
                          • Cookie-less analytics, aggregated; no advertising
                          profiles
                        </li>
                      </ul>
                    </div>
                  </div>
                  {/* Volunteer Information */}
                  <div className="space-y-6">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
                      <h3 className="mb-4 flex items-center text-lg font-semibold text-amber-800 dark:text-amber-200">
                        <HandRaisedIcon className="mr-3 h-5 w-5" />
                        Volunteer Information
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <h4 className="font-medium text-amber-800 dark:text-amber-200">
                            Contact &amp; Logistics
                          </h4>
                          <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                            <li>• Name, email address, and phone number</li>
                            <li>
                              • Occupation status (student, working, unemployed,
                              other)
                            </li>
                            <li>
                              • Availability and preferred volunteer tasks
                            </li>
                          </ul>
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-medium text-amber-800 dark:text-amber-200">
                            Event Coordination
                          </h4>
                          <ul className="space-y-2 text-sm text-amber-700 dark:text-amber-300">
                            <li>• T-shirt size for volunteer shirts</li>
                            <li>
                              • Dietary restrictions (may include health data;
                              collected with explicit consent and used only for
                              event catering)
                            </li>
                            <li>• Other relevant information</li>
                            <li>• Conference assignment</li>
                          </ul>
                        </div>
                      </div>
                      <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
                        <strong>Purpose:</strong> Volunteer coordination and
                        event logistics. <strong>Legal basis:</strong>{' '}
                        Legitimate interests for coordination and operations;
                        explicit consent for special category data (dietary
                        restrictions).
                      </p>
                      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                        See your GDPR rights in section 8 (
                        <a href="#gdpr-rights" className="underline">
                          Your Rights Under GDPR
                        </a>
                        ).
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 3: Legal Basis */}
                <section
                  id="legal-basis"
                  className="space-y-6 print:break-inside-avoid print:space-y-4"
                >
                  <div className="flex items-center space-x-3 print:space-x-0">
                    <ScaleIcon className="h-6 w-6 text-gray-600 dark:text-gray-400 print:hidden" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue print:mt-6 print:mb-3 print:text-xl print:font-bold print:text-black">
                      3. Why We Collect This Information (Legal Basis)
                    </h2>
                  </div>{' '}
                  <div className="font-inter text-brand-slate-gray dark:text-gray-300">
                    <p className="text-base leading-7">
                      We process your personal data based on the following legal
                      grounds under GDPR:
                    </p>
                  </div>
                  <div className="space-y-6">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
                      <h3 className="mb-3 flex items-center text-lg font-semibold text-blue-800 dark:text-blue-200">
                        <ShieldCheckIcon className="mr-3 h-5 w-5" />
                        Legitimate Interest (Article 6(1)(f))
                      </h3>
                      <ul className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                        <li>• Organizing and managing the conference</li>
                        <li>• Speaker selection and coordination</li>
                        <li>• Volunteer coordination and event operations</li>
                        <li>• Conference logistics and communication</li>
                        <li>
                          • Attendee registration and venue access control
                        </li>
                        <li>
                          • Workshop registration, capacity management, and
                          waitlist coordination
                        </li>
                        <li>
                          • Sharing participant lists with venue partners for
                          security and access management
                        </li>
                        <li>• Improving future events</li>
                        <li>• Preserving conference history and archives</li>
                        <li>
                          • Privacy-friendly website analytics and performance
                          monitoring (no advertising)
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
                      <h3 className="mb-3 flex items-center text-lg font-semibold text-green-800 dark:text-green-200">
                        <LockClosedIcon className="mr-3 h-5 w-5" />
                        Consent (Article 6(1)(a))
                      </h3>
                      <ul className="space-y-2 text-sm text-green-700 dark:text-green-300">
                        <li>• Marketing communications and newsletters</li>
                        <li>• Diversity data collection</li>
                        <li>• Photography and recording during events</li>
                        <li>
                          • Public profile information for conference materials
                        </li>
                        <li>• Receipt processing for travel expenses</li>
                        <li>• Financial data processing for reimbursements</li>
                        <li>
                          • Special category data (e.g., health, diversity)
                          processing
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-6 dark:border-orange-800 dark:bg-orange-900/20">
                      <h3 className="mb-3 flex items-center text-lg font-semibold text-orange-800 dark:text-orange-200">
                        <DocumentTextIcon className="mr-3 h-5 w-5" />
                        Contract Performance (Article 6(1)(b))
                      </h3>
                      <ul className="space-y-2 text-sm text-orange-700 dark:text-orange-300">
                        <li>• Processing travel reimbursements for speakers</li>
                        <li>• Managing speaker agreements and obligations</li>
                        <li>• Providing conference-related services</li>
                      </ul>
                    </div>

                    <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
                      <h3 className="mb-3 flex items-center text-lg font-semibold text-red-800 dark:text-red-200">
                        <ExclamationTriangleIcon className="mr-3 h-5 w-5" />
                        Legal Obligation (Article 6(1)(c))
                      </h3>
                      <ul className="space-y-2 text-sm text-red-700 dark:text-red-300">
                        <li>• Financial record keeping and accounting</li>
                        <li>• Compliance with tax and audit requirements</li>
                        <li>• Data protection compliance and reporting</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Section 4: How We Use Your Information */}
                <section id="how-we-use-information" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <CogIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      4. How We Use Your Information
                    </h2>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-blue-800 dark:text-blue-200">
                        <BuildingOfficeIcon className="mr-3 h-4 w-4" />
                        Conference Organization
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Managing speaker applications, scheduling, and logistics
                      </p>
                    </div>

                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-green-800 dark:text-green-200">
                        <EnvelopeIcon className="mr-3 h-4 w-4" />
                        Communication
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Sending updates about the conference, speaking
                        arrangements, and travel
                      </p>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-orange-800 dark:text-orange-200">
                        <BanknotesIcon className="mr-3 h-4 w-4" />
                        Financial Processing
                      </h3>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        Handling travel reimbursements and expense management
                      </p>
                    </div>

                    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-teal-800 dark:text-teal-200">
                        <BuildingOfficeIcon className="mr-3 h-4 w-4" />
                        Venue Coordination
                      </h3>
                      <p className="text-sm text-teal-700 dark:text-teal-300">
                        Registration management, access control, and sharing
                        participant lists with venue partners for security
                      </p>
                    </div>

                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-purple-800 dark:text-purple-200">
                        <GlobeAltIcon className="mr-3 h-4 w-4" />
                        Public Information
                      </h3>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        Displaying speaker profiles and bios on the conference
                        website (with consent)
                      </p>
                    </div>

                    <div className="rounded-lg border border-pink-200 bg-pink-50 p-4 dark:border-pink-800 dark:bg-pink-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-pink-800 dark:text-pink-200">
                        <ChartBarIcon className="mr-3 h-4 w-4" />
                        Website Analytics
                      </h3>
                      <p className="text-sm text-pink-700 dark:text-pink-300">
                        Privacy-friendly, cookie-less analytics to understand
                        site usage (no advertising)
                      </p>
                    </div>

                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
                      <h3 className="mb-2 flex items-center font-semibold text-indigo-800 dark:text-indigo-200">
                        <ArrowPathIcon className="mr-3 h-4 w-4" />
                        Event Improvement
                      </h3>
                      <p className="text-sm text-indigo-700 dark:text-indigo-300">
                        Analyzing feedback to improve future conferences
                      </p>
                    </div>
                  </div>

                  {/* Recordings and Publication (concise clause) */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h3 className="mb-2 flex items-center text-lg font-semibold text-gray-900 dark:text-white">
                      <VideoCameraIcon className="mr-3 h-5 w-5" />
                      Recordings and Publication
                    </h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      We record conference sessions and may publish talks on our
                      official online video channels/platforms. For speakers,
                      the legal basis is our speaking agreement and our
                      legitimate interest in documenting and sharing the event.
                      For attendees, our legitimate interests allow incidental
                      capture; we provide no‑filming areas and will honor
                      reasonable requests for removal or blurring where
                      feasible.
                    </p>
                  </div>
                </section>

                {/* Section 5: Who We Share Your Data With */}
                <section id="data-sharing" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <UserGroupIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      5. Who We Share Your Data With
                    </h2>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                        Essential Service Providers
                      </h3>
                      <div className="space-y-3">
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <LockClosedIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Sanity.io
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Content management and database services
                                (EU-based, GDPR compliant)
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <GlobeAltIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Vercel.com
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Website hosting, infrastructure, content
                                delivery network, and privacy-friendly analytics
                                (Vercel Analytics & Speed Insights; cookie-less)
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <EnvelopeIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Resend.com
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Email delivery service for conference
                                communications
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <DocumentTextIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Checkin.no
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Ticket management and event check-in services
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <ChartBarIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Pirsch Analytics
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Privacy-focused, cookie-less website analytics
                                (aggregated, no advertising profiles)
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <ChatBubbleLeftRightIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                Slack
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Internal organizer notifications for operations
                                (e.g., speaker proposal updates)
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                        Authentication Services
                      </h3>
                      <div className="space-y-3">
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <LockClosedIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                GitHub/LinkedIn
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Authentication services for Call for Papers
                                (when you choose to sign in)
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                          <div className="flex items-start space-x-3">
                            <LockClosedIcon className="mt-1 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                WorkOS (AuthKit)
                              </p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                User authentication and identity management for
                                workshop signups (email, name, user ID,
                                authentication sessions)
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                                Location: United States • Protected by Standard
                                Contractual Clauses
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                        Conference Partners & Venue
                      </h3>
                      <div className="space-y-4">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                          <h4 className="mb-2 flex items-center font-semibold text-blue-800 dark:text-blue-200">
                            <BuildingOfficeIcon className="mr-2 h-4 w-4" />
                            Venue Partners (Legitimate Interest)
                          </h4>
                          <div className="space-y-2 text-sm text-blue-700 dark:text-blue-300">
                            <p>
                              • <strong>Participant registration lists</strong>{' '}
                              - Names and basic contact information shared for
                              venue access control and security
                            </p>
                            <p>
                              • <strong>Speaker information</strong> - Names and
                              session details for event coordination and
                              technical setup
                            </p>
                            <p>
                              • <strong>Logistics coordination</strong> -
                              Information necessary for event management and
                              facility access
                            </p>
                          </div>
                          <div className="mt-3 rounded-lg bg-blue-100 p-2 dark:bg-blue-800/30">
                            <p className="text-xs text-blue-800 dark:text-blue-200">
                              <strong>Legal Basis:</strong> Legitimate interest
                              for event security, access control, and venue
                              management. Data sharing limited to information
                              necessary for venue operations.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              •{' '}
                              <strong>
                                Sponsors for networking opportunities
                              </strong>{' '}
                              (only if you opt in during registration)
                            </p>
                          </div>
                          <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              • <strong>Photography/videography vendors</strong>{' '}
                              for event documentation (with prior notice)
                            </p>
                          </div>
                          <div className="rounded-lg bg-yellow-50 p-3 dark:bg-yellow-900/20">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              •{' '}
                              <strong>
                                Catering and hospitality providers
                              </strong>{' '}
                              for dietary requirements and service coordination
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                      <div className="flex items-center space-x-2">
                        <ShieldCheckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <p className="font-semibold text-green-800 dark:text-green-200">
                          We never sell your personal data to third parties.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 6: International Data Transfers */}
                <section id="international-transfers" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <GlobeAltIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      6. International Data Transfers
                    </h2>
                  </div>

                  <div className="space-y-4">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      Some of our service providers may be located outside the
                      EU/EEA. When we transfer your data internationally, we
                      ensure appropriate safeguards are in place:
                    </p>

                    <div className="space-y-3">
                      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                        <div className="flex items-start space-x-3">
                          <DocumentTextIcon className="mt-1 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                              Standard Contractual Clauses (SCCs) with service
                              providers
                            </p>
                            <ul className="mt-2 list-inside list-disc space-y-2 text-blue-800 dark:text-blue-200">
                              <li>
                                Adequacy decisions by the European Commission
                              </li>
                              <li>
                                Other appropriate safeguards as required by GDPR
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Some providers (e.g., Vercel, Slack, Resend, WorkOS) may
                      process data in the United States. We rely on Standard
                      Contractual Clauses and other safeguards required by GDPR
                      for such transfers.
                    </p>

                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                      <h4 className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
                        WorkOS Authentication
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        WorkOS processes workshop authentication data in the
                        United States. We rely on:
                      </p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-300">
                        <li>
                          Standard Contractual Clauses (SCCs) approved by the
                          European Commission
                        </li>
                        <li>
                          WorkOS&apos;s compliance with applicable data
                          protection frameworks
                        </li>
                        <li>
                          Additional safeguards including encryption at rest and
                          in transit
                        </li>
                        <li>
                          Transfer Impact Assessment documenting residual risks
                          and mitigations
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Section 7: Data Retention */}
                <section id="data-retention" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <ClockIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      7. How Long We Keep Your Data
                    </h2>
                  </div>

                  <div className="space-y-4">
                    <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                      We retain personal data for different periods depending on
                      its purpose and legal requirements:
                    </p>

                    <div className="my-6 overflow-hidden rounded-lg border border-gray-200 shadow-sm dark:border-gray-700 print:overflow-visible print:rounded-none print:border-black print:shadow-none">
                      <table className="w-full border-collapse print:text-sm">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800 print:bg-white">
                            <th className="border-b border-gray-200 px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400 print:border-black print:px-3 print:py-2 print:text-sm print:font-bold print:text-black print:normal-case">
                              Data Type
                            </th>
                            <th className="border-b border-gray-200 px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400 print:border-black print:px-3 print:py-2 print:text-sm print:font-bold print:text-black print:normal-case">
                              Retention Period
                            </th>
                            <th className="border-b border-gray-200 px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400 print:border-black print:px-3 print:py-2 print:text-sm print:font-bold print:text-black print:normal-case">
                              Legal Basis & Reason
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900 print:divide-black print:bg-white">
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 print:border-b print:border-black print:px-3 print:py-2 print:text-black">
                              Active Speaker Profiles
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 print:border-b print:border-black print:px-3 print:py-2 print:text-black">
                              3 years after last conference participation
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 print:border-b print:border-black print:px-3 print:py-2 print:text-black">
                              <span className="font-medium text-blue-600 dark:text-blue-400 print:font-semibold print:text-black">
                                Legitimate Interest:
                              </span>{' '}
                              Future conference invitations and speaker outreach
                            </td>
                          </tr>
                          <tr className="bg-blue-50 dark:bg-blue-900/20">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Archived Speaker Profiles
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                (Previously published conference programs)
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium">Indefinitely</span>
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                With option to request removal
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-green-600 dark:text-green-400">
                                Public Interest Archiving (Art. 89):
                              </span>{' '}
                              Historical documentation of technology community
                              events and speakers.
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              Maintaining public archives of past conferences
                              for community and historical value.
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Banking & Financial Information
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              5 years after transaction completion
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-purple-600 dark:text-purple-400">
                                Legal Obligation:
                              </span>{' '}
                              Norwegian accounting and tax law requirements for
                              financial records
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Travel Receipts & Documentation
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              5 years after reimbursement
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-purple-600 dark:text-purple-400">
                                Legal Obligation:
                              </span>{' '}
                              Financial record keeping and audit requirements
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Email Communications
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              2 years after conference
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              Conference documentation and operational
                              continuity
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Attendee & Participant Data
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                (Registration, check-in, preferences)
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              2 years after conference completion
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              Event management, security, future event planning,
                              and attendee experience improvement
                            </td>
                          </tr>
                          <tr className="bg-amber-50 dark:bg-amber-900/20">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Workshop Registration Data
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                (Signups, experience levels, system preferences)
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              2 years after conference completion
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              Workshop planning and speaker preparation for
                              future events, capacity planning, and participant
                              experience improvement
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Marketing Consent & Preferences
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              Until withdrawn or 3 years of inactivity
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-orange-600 dark:text-orange-400">
                                Consent:
                              </span>{' '}
                              Active consent management and preference tracking
                            </td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              Volunteer Applications &amp; Information
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                (Contact details, availability, preferences,
                                assignments)
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              12 months after event completion, or earlier if
                              consent is withdrawn for consent-based fields
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              Volunteer coordination, event operations, and
                              safety management. Consent for special category
                              data (dietary restrictions)
                            </td>
                          </tr>
                          <tr className="bg-purple-50 dark:bg-purple-900/20">
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              WorkOS Authentication Data
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                (User ID, email, name, authentication sessions)
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              Duration of active workshop registration + 2 years
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-blue-600 dark:text-blue-400">
                                Legitimate Interest:
                              </span>{' '}
                              User account management, audit trail for capacity
                              management, and preventing duplicate
                              registrations.
                              <span className="font-medium text-orange-600 dark:text-orange-400">
                                {' '}
                                Contract Performance:
                              </span>{' '}
                              Authentication required to access registered
                              workshops
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="my-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <h4 className="mb-2 flex items-center font-semibold text-blue-800 dark:text-blue-200">
                        <BookOpenIcon className="mr-2 h-4 w-4" />
                        About Archived Speaker Profiles
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        We maintain archived versions of conference programs
                        with speaker information for historical and community
                        purposes. This information was previously published with
                        consent and serves the public interest of documenting
                        our technology community&rsquo;s history. You can
                        request removal of your information from archives at any
                        time by contacting us.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 8: Your Rights Under GDPR */}
                <section id="gdpr-rights" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <ShieldCheckIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      8. Your Rights Under GDPR
                    </h2>
                  </div>

                  <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                    You have comprehensive rights regarding your personal data.
                    Here&rsquo;s what you can do:
                  </p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <EyeIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Access{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 15)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Request a copy of all personal data we hold about you,
                        including how it&rsquo;s processed.
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <PencilIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Rectification{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 16)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Correct any inaccurate or incomplete personal data we
                        have about you.
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <TrashIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Erasure{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 17)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Request deletion of your personal data in certain
                        circumstances (right to be forgotten).
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <PauseIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Restrict Processing{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 18)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Limit how we use your personal data in certain
                        situations while keeping it stored.
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <ArrowUpTrayIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Data Portability{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 20)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Receive your personal data in a machine-readable format
                        to transfer to another service.
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <NoSymbolIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Object{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Article 21)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Object to processing based on legitimate interests or
                        for marketing purposes. This includes the right to
                        object to analytics based on our legitimate interests.
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                      <h3 className="mb-2 flex items-center text-lg font-semibold">
                        <UserMinusIcon className="mr-2 h-5 w-5 text-gray-600 dark:text-gray-400" />
                        Right to Untag from Photos{' '}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          (Photo Gallery Control)
                        </span>
                      </h3>
                      <p className="text-sm">
                        Remove yourself from event photos at any time. Once you
                        untag yourself, the system prevents re-tagging you in
                        that photo, permanently respecting your choice.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                    <h4 className="mb-2 flex items-center font-semibold text-orange-800 dark:text-orange-200">
                      <ArrowPathIcon className="mr-2 h-4 w-4" />
                      Right to Withdraw Consent
                    </h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Where we process your data based on consent, you can
                      withdraw that consent at any time. This won&rsquo;t affect
                      the lawfulness of processing before withdrawal.
                    </p>
                  </div>

                  <div className="my-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                    <h4 className="mb-2 font-semibold text-green-800 dark:text-green-200">
                      How to Exercise Your Rights
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Contact us at{' '}
                      <a href={`mailto:${contactEmail}`} className="underline">
                        {contactEmail}
                      </a>{' '}
                      to exercise any of these rights. We will respond within 30
                      days and may request identity verification for security
                      purposes.
                    </p>
                  </div>
                </section>

                {/* Section 9: Data Security */}
                <section id="data-security" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <LockClosedIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      9. Data Security
                    </h2>
                  </div>

                  <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                    We implement comprehensive security measures to protect your
                    personal data from unauthorized access, alteration,
                    disclosure, or destruction:
                  </p>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                      <div className="mb-2 flex items-center">
                        <LockClosedIcon className="mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
                        <h3 className="font-semibold text-green-800 dark:text-green-200">
                          Encryption
                        </h3>
                      </div>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        All data is encrypted in transit (HTTPS/TLS) and at rest
                        using industry-standard encryption protocols.
                      </p>
                    </div>

                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                      <div className="mb-2 flex items-center">
                        <UserIcon className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                          Access Controls
                        </h3>
                      </div>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Role-based access controls with organizer-only admin
                        functions and multi-factor authentication.
                      </p>
                    </div>

                    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-900/20">
                      <div className="mb-2 flex items-center">
                        <ShieldCheckIcon className="mr-2 h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <h3 className="font-semibold text-purple-800 dark:text-purple-200">
                          Authentication
                        </h3>
                      </div>
                      <p className="text-sm text-purple-700 dark:text-purple-300">
                        Secure OAuth-based authentication through trusted
                        providers (GitHub, LinkedIn).
                      </p>
                    </div>

                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
                      <div className="mb-2 flex items-center">
                        <ArrowPathIcon className="mr-2 h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                          Regular Updates
                        </h3>
                      </div>
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        Continuous security patches, system updates, and
                        vulnerability monitoring.
                      </p>
                    </div>

                    <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/20">
                      <div className="mb-2 flex items-center">
                        <ChartBarIcon className="mr-2 h-4 w-4 text-teal-600 dark:text-teal-400" />
                        <h3 className="font-semibold text-teal-800 dark:text-teal-200">
                          Data Minimization
                        </h3>
                      </div>
                      <p className="text-sm text-teal-700 dark:text-teal-300">
                        We only collect and process data that is necessary for
                        our stated purposes.
                      </p>
                    </div>

                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
                      <div className="mb-2 flex items-center">
                        <UserGroupIcon className="mr-2 h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-semibold text-indigo-800 dark:text-indigo-200">
                          Staff Training
                        </h3>
                      </div>
                      <p className="text-sm text-indigo-700 dark:text-indigo-300">
                        Regular privacy and security training for all organizers
                        and team members.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Section 10: Cookies and Tracking */}
                <section id="cookies-tracking" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <CogIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      10. Cookies and Tracking
                    </h2>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800">
                    <p className="mb-4 text-gray-700 dark:text-gray-300">
                      Our website uses essential cookies for:
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="flex items-center rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                        <LockClosedIcon className="mr-2 h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-green-800 dark:text-green-200">
                          Authentication & Sessions
                        </span>
                      </div>
                      <div className="flex items-center rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                        <CogIcon className="mr-2 h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                          Application Functionality
                        </span>
                      </div>
                      <div className="flex items-center rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
                        <ShieldCheckIcon className="mr-2 h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
                          Security & Fraud Prevention
                        </span>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                      <strong>No advertising cookies:</strong> We do not use
                      cookies for advertising or cross-site tracking. Our
                      analytics are cookie-less and aggregated.
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <strong>localStorage:</strong> We use your browser’s
                      localStorage to save personal bookmarks on your device.
                      This isn’t sent to our servers.
                    </p>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <strong>Opt-out:</strong> You can object to analytics by
                      contacting us or using tools that block analytics
                      requests; we will respect your choice.
                    </p>
                  </div>
                </section>

                {/* Section 11: Children's Privacy */}
                <section id="childrens-privacy" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <UserIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      11. Children&rsquo;s Privacy
                    </h2>
                  </div>

                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <p className="text-yellow-800 dark:text-yellow-200">
                      <strong>Age Restriction:</strong> Our services are not
                      intended for individuals under 13 years of age. We do not
                      knowingly collect personal data from children under 13. If
                      you become aware that a child has provided us with
                      personal data, please contact us immediately and we will
                      delete it.
                    </p>
                  </div>
                </section>

                {/* Section 12: Changes to This Privacy Policy */}
                <section id="policy-changes" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <DocumentTextIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      12. Changes to This Privacy Policy
                    </h2>
                  </div>

                  <p className="text-base leading-7 text-gray-700 dark:text-gray-300">
                    We may update this privacy policy from time to time. When we
                    make changes, we will:
                  </p>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-start rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                      <CalendarIcon className="mt-0.5 mr-3 h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium text-blue-800 dark:text-blue-200">
                          Update the date
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Update the &ldquo;Last updated&rdquo; date at the top
                          of this policy
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                      <EnvelopeIcon className="mt-0.5 mr-3 h-4 w-4 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">
                          Notify active users
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Send email notifications about significant changes
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-900/20">
                      <CheckIcon className="mt-0.5 mr-3 h-4 w-4 text-orange-600 dark:text-orange-400" />
                      <div>
                        <p className="font-medium text-orange-800 dark:text-orange-200">
                          Request renewed consent
                        </p>
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          For significant changes, we may request renewed
                          consent where required by law
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Section 13: Contact Information and Complaints */}
                <section id="contact-complaints" className="space-y-6">
                  <div className="flex items-center space-x-3">
                    <PhoneIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h2 className="font-space-grotesk text-2xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                      13. Contact Information and Complaints
                    </h2>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
                      <h4 className="mb-4 flex items-center text-lg font-semibold text-blue-800 dark:text-blue-200">
                        <ChatBubbleOvalLeftIcon className="mr-2 h-5 w-5" />
                        Contact Us
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <p className="font-medium text-blue-800 dark:text-blue-200">
                            For privacy-related questions:
                          </p>
                          <a
                            href={`mailto:${contactEmail}`}
                            className="inline-flex items-center text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            <span className="mr-1">📧</span>
                            {contactEmail}
                          </a>
                        </div>
                        <div>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            <strong>Subject line:</strong> Please include
                            &ldquo;Privacy Policy&rdquo; in your email subject
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            <strong>Response time:</strong> We will respond
                            within 30 days and may request identity verification
                            for security purposes
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
                      <h4 className="mb-4 flex items-center text-lg font-semibold text-red-800 dark:text-red-200">
                        <ScaleIcon className="mr-2 h-5 w-5" />
                        File a Complaint
                      </h4>
                      <p className="mb-3 text-sm text-red-700 dark:text-red-300">
                        If you believe we have not handled your personal data
                        properly, you have the right to lodge a complaint with
                        the data protection authority:
                      </p>
                      <div className="rounded-lg border border-red-300 bg-red-100 p-3 dark:border-red-700 dark:bg-red-800/30">
                        <p className="mb-2 flex items-center font-semibold text-red-800 dark:text-red-200">
                          <FlagIcon className="mr-2 h-4 w-4" />
                          Norwegian Data Protection Authority (Datatilsynet)
                        </p>
                        <div className="space-y-1 text-sm text-red-700 dark:text-red-300">
                          <p>
                            <strong>Website:</strong>{' '}
                            <a
                              href="https://www.datatilsynet.no"
                              className="text-red-600 underline hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              www.datatilsynet.no
                            </a>
                          </p>
                          <p>
                            <strong>Email:</strong> postkasse@datatilsynet.no
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <hr className="my-8 print:my-4 print:border-black" />

                <p className="text-sm text-gray-600 dark:text-gray-400 print:mt-4 print:text-base print:leading-relaxed print:text-black">
                  This privacy policy complies with the EU General Data
                  Protection Regulation (GDPR) and Norwegian data protection
                  laws.
                </p>
              </div>
            </div>
          </ContentCard>
        </Container>
      </div>
    </>
  )
}

export default async function PrivacyPage() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedPrivacyContent domain={domain} />
}
