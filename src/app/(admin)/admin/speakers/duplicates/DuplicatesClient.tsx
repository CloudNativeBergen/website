'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { DuplicateSpeakersList } from '@/components/admin/DuplicateSpeakersList'
import {
  SpeakerMergeModal,
  type MergeCandidate,
} from '@/components/admin/SpeakerMergeModal'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { UsersIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline'

export function DuplicatesClient() {
  const router = useRouter()
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false)
  const [mergeSeed, setMergeSeed] = useState<{
    survivorId: string
    loserId: string
  } | null>(null)

  const duplicatesQuery = api.speaker.admin.duplicateCandidates.useQuery(
    undefined,
    { retry: false },
  )

  const handleMergePair = (pair: { survivorId: string; loserId: string }) => {
    setMergeSeed(pair)
    setIsMergeModalOpen(true)
  }

  // The candidate source is the org-scoped, talk-status-agnostic corpus.
  const mergeCandidates: MergeCandidate[] =
    duplicatesQuery.data?.mergeCandidates ?? []

  return (
    <>
      <AdminPageHeader
        title="Duplicate Speakers"
        description="Review and merge potential duplicate speaker profiles."
        icon={<UsersIcon className="h-6 w-6" />}
        backLink={{ href: '/admin/speakers', label: 'Back to Speakers' }}
        actionItems={[
          {
            label: 'Merge Manually',
            onClick: () => {
              setMergeSeed(null)
              setIsMergeModalOpen(true)
            },
            icon: <ArrowsPointingInIcon className="h-4 w-4" />,
          },
        ]}
      />
      <div className="mt-8">
        <DuplicateSpeakersList
          groups={duplicatesQuery.data?.groups ?? []}
          scannedCount={duplicatesQuery.data?.scannedCount ?? 0}
          isLoading={duplicatesQuery.isLoading}
          errorMessage={duplicatesQuery.error?.message ?? null}
          onMergePair={handleMergePair}
        />
      </div>

      <SpeakerMergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        speakers={mergeCandidates}
        initialSurvivorId={mergeSeed?.survivorId}
        initialLoserId={mergeSeed?.loserId}
        onMerged={() => {
          duplicatesQuery.refetch()
          router.refresh()
        }}
      />
    </>
  )
}
