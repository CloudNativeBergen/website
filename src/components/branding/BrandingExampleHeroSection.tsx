'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'
import { Button } from '@/components/Button'
import { Conference } from '@/lib/conference/types'
import { formatDatesSafe } from '@/lib/time'

interface BrandingExampleHeroSectionProps {
  conference?: Conference
}

export function BrandingExampleHeroSection({
  conference,
}: BrandingExampleHeroSectionProps) {
  const title = conference?.title || 'Cloud Native Days'
  const dateText = conference
    ? formatDatesSafe(conference.start_date, conference.end_date)
    : 'Coming Soon'
  const location =
    conference?.city && conference?.country
      ? `${conference.city}, ${conference.country}`
      : 'Location TBA'

  return (
    <div className="relative overflow-hidden rounded-xl bg-brand-gradient p-12 text-center">
      <CloudNativePattern
        className="z-0"
        opacity={0.15}
        animated={true}
        variant="brand"
        baseSize={45}
        iconCount={80}
      />
      <div className="absolute inset-0 z-10 rounded-xl bg-black/30"></div>
      <div className="relative z-20">
        <h1 className="font-jetbrains mb-4 text-4xl font-bold text-white">
          {title}
        </h1>
        <p className="font-space-grotesk mb-8 text-xl text-white/90">
          {dateText} &bull; {location}
        </p>
        <p className="font-inter mx-auto mb-8 max-w-2xl text-lg text-white/95">
          Join the Nordic cloud native community for a day of cutting-edge
          talks, hands-on workshops, and meaningful connections.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <Button variant="primary" className="font-space-grotesk">
            Register Now
          </Button>
          <Button className="font-space-grotesk bg-transparent text-white shadow-[inset_0_0_0_2px_white] transition-colors duration-200 hover:bg-white hover:text-brand-cloud-blue hover:shadow-[inset_0_0_0_2px_white]">
            Submit a Talk
          </Button>
        </div>
      </div>
    </div>
  )
}
