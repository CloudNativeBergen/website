'use client'
/**
 * PROTOTYPE — mounts the density variants on the real /admin/marketing route
 * behind `?variant=A|B|C`, using the real `marketing.plan.get` data. Without
 * the param the page renders normally, so this is invisible until asked for.
 */
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { MarketingPlanPrototype, type VariantKey } from './Prototype'

const KEYS: VariantKey[] = ['A', 'B', 'C']

export function PrototypeHost() {
  const router = useRouter()
  const params = useSearchParams()
  const raw = params.get('variant')?.toUpperCase() ?? ''
  const variant = (KEYS as string[]).includes(raw) ? (raw as VariantKey) : 'A'
  const plan = api.marketing.plan.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })

  if (!plan.data) {
    return (
      <p className="p-6 text-sm text-gray-500">
        {plan.isLoading ? 'Loading the plan…' : 'This edition has no plan yet.'}
      </p>
    )
  }
  return (
    <MarketingPlanPrototype
      view={plan.data}
      variant={variant}
      onVariant={(v) => {
        const next = new URLSearchParams(params.toString())
        next.set('variant', v)
        router.replace(`?${next.toString()}`)
      }}
    />
  )
}
