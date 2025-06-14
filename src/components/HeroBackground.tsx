import { CloudNativePattern } from '@/components/CloudNativePattern'

export function HeroBackground() {
  return (
    <>
      <CloudNativePattern
        className="absolute inset-0 z-0"
        opacity={0.08}
        animated={true}
        variant="brand"
        baseSize={35}
        iconCount={60}
      />
      <div className="absolute inset-0 z-10 bg-brand-gradient opacity-90"></div>
    </>
  )
}
