'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { DeleteConfirmation } from './DeleteCampaignDialog'

export function DeletePlanDialog({ onClose }: { onClose: () => void }) {
  const preview = api.marketing.plan.deletionPreview.useQuery(undefined, {
    refetchOnWindowFocus: false,
  })
  const utils = api.useUtils()
  const router = useRouter()
  const deletion = api.marketing.plan.delete.useMutation({
    onSuccess: () => {
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.report.invalidate()
      void utils.marketing.campaign.invalidate()
      router.push('/admin/marketing')
      onClose()
    },
  })
  return (
    <DeleteConfirmation
      label="plan"
      preview={preview.isFetching ? undefined : preview.data}
      error={preview.error?.message ?? deletion.error?.message}
      pending={deletion.isPending}
      onClose={onClose}
      onConfirm={(confirmTitle) => deletion.mutate({ confirmTitle })}
    />
  )
}

export function DeletePlanSection() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-gray-900">
      <h2 className="text-lg font-semibold">Delete marketing plan</h2>
      <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
        Permanently remove the plan, its Campaigns and Tasks. Published posts
        and stored measurements remain. You can create a new plan afterwards, or
        leave this edition without one.
      </p>
      <AdminButton className="mt-4" color="red" onClick={() => setOpen(true)}>
        Delete plan
      </AdminButton>
      {open && <DeletePlanDialog onClose={() => setOpen(false)} />}
    </section>
  )
}
