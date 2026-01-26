import { Container } from '@/components/Container'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { Conference } from '@/lib/conference/types'
import { iconForLink } from '@/components/SocialIcons'
import Link from 'next/link'

export function Footer({ c }: { c: Conference }) {
  return (
    <footer className="flex-none py-16">
      <Container className="flex flex-col items-center justify-between md:flex-row">
        <ConferenceLogo
          conference={c}
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
            {c.social_links?.map((link) => (
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
        <p className="font-inter mt-6 text-base text-brand-cloud-gray md:mt-0">
          Copyright &copy; {new Date().getFullYear()} {c.organizer}. All rights
          reserved.
        </p>
      </Container>
    </footer>
  )
}
