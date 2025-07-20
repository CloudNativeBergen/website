'use client'

import { useEffect, useState } from 'react'
import {
  ErrorDisplay,
  SpeakerTable,
  BroadcastEmailModal,
} from '@/components/admin'
import { Button } from '@/components/Button'
import {
  UserGroupIcon,
  EnvelopeIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { PortableTextBlock } from '@portabletext/editor'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'

interface Conference {
  _id: string
  title: string
}

export default function AdminSpeakers() {
  const [conference, setConference] = useState<Conference | null>(null)
  const [speakers, setSpeakers] = useState<
    (Speaker & { proposals: ProposalExisting[] })[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/admin/api/speakers')

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to load data')
        }

        const { conference: conf, speakers: speakerData } =
          await response.json()
        setConference(conf)
        setSpeakers(speakerData)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSendBroadcast = async (
    subject: string,
    content: PortableTextBlock[],
  ) => {
    try {
      const response = await fetch('/admin/api/speakers/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, content }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send broadcast email')
      }

      alert(`Email successfully sent to ${result.recipientCount} speakers!`)
    } catch (error: unknown) {
      console.error('Broadcast error:', error)
      throw error // Re-throw to be handled by the modal
    }
  }

  const handleSyncAudience = async () => {
    setSyncLoading(true)
    try {
      const response = await fetch('/admin/api/speakers/audience/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync audience')
      }

      alert(
        `Successfully synced ${result.syncedCount} speakers with the email audience!`,
      )
    } catch (error: unknown) {
      console.error('Sync error:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to sync audience: ${errorMessage}`)
    } finally {
      setSyncLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="animate-pulse">
          <div className="mb-4 h-8 w-1/3 rounded-xl bg-brand-sky-mist"></div>
          <div className="mb-8 h-4 w-2/3 rounded-lg bg-brand-sky-mist"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-brand-sky-mist"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorDisplay title="Error Loading Data" message={error} />
  }

  if (!conference || !speakers) {
    return (
      <ErrorDisplay
        title="Data Not Found"
        message="Could not load conference or speaker data"
      />
    )
  }

  const eligibleSpeakers = speakers.filter(
    (speaker) =>
      speaker.email &&
      speaker.proposals?.some(
        (proposal) =>
          proposal.status === 'accepted' || proposal.status === 'confirmed',
      ),
  )

  return (
    <>
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-brand-frosted-steel pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue" />
              <div>
                <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight">
                  Speaker Management
                </h1>
                <p className="font-inter mt-2 text-sm text-brand-slate-gray/70">
                  Manage speakers with accepted or confirmed talks for{' '}
                  <span className="font-medium text-brand-cloud-blue">
                    {conference.title}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSyncAudience}
                disabled={syncLoading || eligibleSpeakers.length === 0}
                className="font-space-grotesk flex items-center gap-2 rounded-xl border border-brand-frosted-steel px-4 py-2 text-brand-slate-gray transition-colors duration-200 hover:bg-brand-sky-mist disabled:opacity-50"
              >
                <ArrowPathIcon
                  className={`h-4 w-4 ${syncLoading ? 'animate-spin' : ''}`}
                />
                {syncLoading ? 'Syncing...' : 'Sync Audience'}
              </Button>

              <Button
                onClick={() => setIsModalOpen(true)}
                className="font-space-grotesk flex items-center gap-2 rounded-xl bg-brand-cloud-blue px-4 py-2 text-white transition-colors duration-200 hover:bg-primary-700"
                disabled={eligibleSpeakers.length === 0}
              >
                <EnvelopeIcon className="h-4 w-4" />
                Email Speakers
              </Button>
            </div>
          </div>

          <div className="font-inter mt-4 flex items-center gap-4 text-sm text-brand-slate-gray">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-fresh-green"></div>
              <span>
                {
                  speakers.filter((s) =>
                    s.proposals.some((p) => p.status === 'confirmed'),
                  ).length
                }{' '}
                with confirmed talks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-cloud-blue"></div>
              <span>
                {
                  speakers.filter((s) =>
                    s.proposals.some((p) => p.status === 'accepted'),
                  ).length
                }{' '}
                with accepted talks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-frosted-steel"></div>
              <span>{speakers.length} total speakers</span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <SpeakerTable speakers={speakers} />
        </div>
      </div>

      <BroadcastEmailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSend={handleSendBroadcast}
        speakerCount={eligibleSpeakers.length}
      />
    </>
  )
}
