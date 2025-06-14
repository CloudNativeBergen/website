import { CloudNativePattern } from '@/components/CloudNativePattern'

export function HeroBackground() {
  return (
    <>
      <CloudNativePattern
        className="absolute inset-0 z-0"
        opacity={0.08}
        animated={true}
        variant="brand"
        density="low"
        minSize={20}
        maxSize={50}
        minCount={25}
        maxCount={50}
      />
      <div className="absolute inset-0 z-10 bg-brand-gradient opacity-90"></div>
    </>
  )
}
