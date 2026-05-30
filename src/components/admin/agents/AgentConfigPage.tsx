'use client'

import React, { useState, useEffect } from 'react'
import { api } from '@/lib/trpc/client'
import {
  CpuChipIcon,
  DocumentMagnifyingGlassIcon,
  UserGroupIcon,
  SparklesIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'
import { useNotification } from '../NotificationProvider'
import clsx from 'clsx'

export function AgentConfigPageClient() {
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const { data: config, isLoading } = api.agents.get.useQuery()

  const [formData, setFormData] = useState({
    conferenceContext: '',
    proposalReviewConfig: '',
    sponsorCrmConfig: '',
  })

  useEffect(() => {
    if (config) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        conferenceContext: config.conferenceContext || '',
        proposalReviewConfig: config.proposalReviewConfig || '',
        sponsorCrmConfig: config.sponsorCrmConfig || '',
      })
    }
  }, [config])

  const updateMutation = api.agents.update.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Configuration Saved',
        message: 'Agent configuration has been updated successfully.',
      })
      utils.agents.get.invalidate()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update agent configuration.',
      })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate(formData)
  }

  const isDirty =
    config &&
    (formData.conferenceContext !== (config.conferenceContext || '') ||
      formData.proposalReviewConfig !== (config.proposalReviewConfig || '') ||
      formData.sponsorCrmConfig !== (config.sponsorCrmConfig || ''))

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <AdminPageHeader
        icon={<CpuChipIcon className="size-full" />}
        title="Agent Configuration"
        description="Configure AI agents for proposal review, sponsor management, and general conference mission."
      />

      <div className="mt-8">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <ArrowPathIcon className="size-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-8">
            {/* Conference Context */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <SparklesIcon className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Conference Context
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Define the general goal, purpose, and scope of the
                    conference.
                  </p>
                </div>
              </div>
              <textarea
                rows={6}
                value={formData.conferenceContext}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    conferenceContext: e.target.value,
                  })
                }
                placeholder="What is this conference about? Who is the target audience? What are the key themes?"
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>

            {/* Proposal Review Config */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                  <DocumentMagnifyingGlassIcon className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Proposal Reviewer
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Criteria for agents to review and judge talk proposals.
                  </p>
                </div>
              </div>
              <textarea
                rows={6}
                value={formData.proposalReviewConfig}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    proposalReviewConfig: e.target.value,
                  })
                }
                placeholder="What criteria should the reviewer use? Technical depth, relevancy, diversity, etc."
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>

            {/* Sponsor CRM Config */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/5">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  <UserGroupIcon className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Sponsor CRM Agent
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Behavioral guidelines for agents communicating with
                    sponsors.
                  </p>
                </div>
              </div>
              <textarea
                rows={6}
                value={formData.sponsorCrmConfig}
                onChange={(e) =>
                  setFormData({ ...formData, sponsorCrmConfig: e.target.value })
                }
                placeholder="Tone of voice, follow-up rules, and specific sponsor relations strategy."
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>

            <div className="sticky bottom-4 flex justify-end">
              <button
                type="submit"
                disabled={updateMutation.isPending || !isDirty}
                className={clsx(
                  'flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
                  isDirty
                    ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                    : 'cursor-not-allowed bg-gray-400 dark:bg-gray-700',
                )}
              >
                {updateMutation.isPending ? (
                  <>
                    <ArrowPathIcon className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckIcon className="size-4" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
