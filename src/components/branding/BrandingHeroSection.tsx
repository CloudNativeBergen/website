import { CloudNativePattern } from '@/components/CloudNativePattern'
import { Container } from '@/components/Container'

export function BrandingHeroSection() {
  return (
    <section className="relative overflow-hidden bg-aqua-gradient py-24">
      <CloudNativePattern
        className="z-0"
        opacity={0.18}
        animated={true}
        variant="brand"
        baseSize={50}
        iconCount={100}
      />
      <div className="absolute inset-0 z-10 bg-black/30"></div>
      <Container className="relative z-20">
        <div className="text-center">
          <h1 className="font-jetbrains mb-6 text-5xl font-bold text-white">
            Cloud Native Day Bergen
          </h1>
          <p className="font-space-grotesk mx-auto mb-8 max-w-3xl text-xl text-white">
            Brand Guidelines & Design System
          </p>
          <p className="font-inter mx-auto max-w-2xl text-lg text-white/95">
            Our brand reflects the spirit of the cloud native community:
            innovative, open, collaborative, and forward-thinking. These
            guidelines ensure consistent and impactful communication across all
            touchpoints.
          </p>
        </div>
      </Container>
    </section>
  )
}
