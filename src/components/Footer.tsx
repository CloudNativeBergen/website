import { Container } from '@/components/Container'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { PoweredBy } from '@/components/PoweredBy'
import { Conference } from '@/lib/conference/types'
import { pickConferenceLogoProps } from '@/lib/conference/logo'
import { iconForLink } from '@/components/SocialIcons'
import Link from 'next/link'

export function Footer({ c }: { c: Conference }) {
  return (
    <footer className="flex-none py-16">
      <Container className="flex flex-col items-center justify-between gap-6 md:flex-row md:gap-8">
        <ConferenceLogo
          conference={pickConferenceLogoProps(c)}
          variant="horizontal"
          className="h-12 w-auto text-brand-slate-gray dark:text-white"
        />
        <div className="mt-6 flex flex-col items-center space-y-4 md:mt-0 md:flex-row md:space-y-0 md:space-x-8">
          <nav className="flex flex-col items-center space-y-2 md:flex-row md:space-y-0 md:space-x-6">
            <Link
              href="/conduct"
              className="font-inter text-base text-brand-cloud-blue transition-colors hover:text-brand-slate-gray"
            >
              Code of Conduct
            </Link>
            <Link
              href="/privacy"
              className="font-inter text-base text-brand-cloud-blue transition-colors hover:text-brand-slate-gray"
            >
              Privacy Policy
            </Link>
          </nav>
          <div className="flex space-x-4">
            {c.socialLinks?.map((link) => (
              <a
                key={link}
                href={link}
                className="text-brand-cloud-blue hover:text-brand-slate-gray"
              >
                {iconForLink(link, 'h-12 w-12')}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-6 flex flex-col items-center gap-1 md:mt-0 md:items-end">
          <p className="font-inter text-base text-brand-cloud-gray">
            Copyright &copy; {new Date().getFullYear()} {c.organizer}. All
            rights reserved.
          </p>
          {/* Single call site for the platform credit — see PoweredBy. */}
          <PoweredBy />
        </div>
      </Container>
    </footer>
  )
}
