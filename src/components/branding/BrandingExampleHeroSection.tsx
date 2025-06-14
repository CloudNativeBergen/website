'use client'

import { CloudNativePattern } from '@/components/CloudNativePattern'
import { Button } from '@/components/Button'

export function BrandingExampleHeroSection() {
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
          Cloud Native Day Bergen 2025
        </h1>
        <p className="font-space-grotesk mb-8 text-xl text-white/90">
          June 15, 2025 • Bergen, Norway
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
