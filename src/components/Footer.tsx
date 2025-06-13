import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { Conference } from '@/lib/conference/types'
import { iconForLink } from '@/components/SocialIcons'

export function Footer({ c }: { c: Conference }) {
  return (
    <footer className="flex-none py-16">
      <Container className="flex flex-col items-center justify-between md:flex-row">
        <Logo className="h-12 w-auto text-slate-900" />
        <div className="mt-6 flex flex-col items-center space-y-4 md:mt-0 md:flex-row md:space-y-0 md:space-x-6">
          <div className="flex space-x-4">
            {c.social_links?.map((link) => (
              <a key={link} href={link} className="text-blue-600">
                {iconForLink(link, 'h-12 w-12')}
              </a>
            ))}
          </div>
          <nav className="flex space-x-4 text-sm">
            <a href="/branding" className="text-slate-600 hover:text-brand-cloud-blue">
              Brand Guidelines
            </a>
          </nav>
        </div>
        <p className="mt-6 text-base text-slate-500 md:mt-0">
          Copyright &copy; {new Date().getFullYear()} {c.organizer}. All rights
          reserved.
        </p>
      </Container>
    </footer>
  )
}
