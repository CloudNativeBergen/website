'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  TicketIcon,
} from '@heroicons/react/24/outline'
import type {
  TicketCustomization,
  TicketInclusion,
  TicketFaq,
  ConferenceVanityMetric,
} from '@/lib/conference/types'

const ICON_OPTIONS = [
  { value: 'MicrophoneIcon', label: 'Microphone' },
  { value: 'UserGroupIcon', label: 'User Group' },
  { value: 'PresentationChartBarIcon', label: 'Presentation' },
  { value: 'AcademicCapIcon', label: 'Academic Cap' },
  { value: 'SparklesIcon', label: 'Sparkles' },
  { value: 'LightBulbIcon', label: 'Light Bulb' },
  { value: 'BeakerIcon', label: 'Beaker' },
  { value: 'GiftIcon', label: 'Gift' },
  { value: 'FilmIcon', label: 'Film' },
  { value: 'CameraIcon', label: 'Camera' },
  { value: 'CodeBracketIcon', label: 'Code Bracket' },
  { value: 'CommandLineIcon', label: 'Command Line' },
  { value: 'CpuChipIcon', label: 'CPU Chip' },
  { value: 'ChatBubbleLeftRightIcon', label: 'Chat Bubble' },
  { value: 'TrophyIcon', label: 'Trophy' },
  { value: 'HeartIcon', label: 'Heart' },
  { value: 'StarIcon', label: 'Star' },
  { value: 'GlobeAltIcon', label: 'Globe' },
  { value: 'MusicalNoteIcon', label: 'Musical Note' },
  { value: 'CheckBadgeIcon', label: 'Check Badge' },
]

function generateKey(): string {
  return Math.random().toString(36).substring(2, 10)
}

interface TicketPageContentEditorProps {
  conferenceId: string
  conferenceTitle: string
  initialCustomization: Partial<TicketCustomization>
  initialInclusions: TicketInclusion[]
  initialFaqs: TicketFaq[]
  vanityMetrics: ConferenceVanityMetric[]
}

export function TicketPageContentEditor({
  conferenceId,
  conferenceTitle,
  initialCustomization,
  initialInclusions,
  initialFaqs,
  vanityMetrics,
}: TicketPageContentEditorProps) {
  const [customization, setCustomization] =
    useState<Partial<TicketCustomization>>(initialCustomization)
  const [inclusions, setInclusions] =
    useState<TicketInclusion[]>(initialInclusions)
  const [faqs, setFaqs] = useState<TicketFaq[]>(initialFaqs)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  )

  const updateMutation = api.tickets.updatePageContent.useMutation({
    onSuccess: () => {
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
    },
    onError: () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    },
    onSettled: () => {
      setSaving(false)
    },
  })

  const handleSave = useCallback(() => {
    setSaving(true)
    updateMutation.mutate({
      conferenceId,
      ticket_customization: {
        hero_headline: customization.hero_headline || undefined,
        hero_subheadline: customization.hero_subheadline || undefined,
        show_vanity_metrics: customization.show_vanity_metrics ?? false,
        group_discount_info: customization.group_discount_info || undefined,
        cta_button_text: customization.cta_button_text || undefined,
      },
      ticket_inclusions: inclusions.map((inc) => ({
        _key: inc._key || generateKey(),
        title: inc.title,
        description: inc.description || undefined,
        icon: inc.icon || undefined,
      })),
      ticket_faqs: faqs.map((faq) => ({
        _key: faq._key || generateKey(),
        question: faq.question,
        answer: faq.answer,
      })),
    })
  }, [conferenceId, customization, inclusions, faqs, updateMutation])

  const addInclusion = useCallback(() => {
    setInclusions((prev) => [
      ...prev,
      { _key: generateKey(), title: '', description: '', icon: '' },
    ])
  }, [])

  const removeInclusion = useCallback((index: number) => {
    setInclusions((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateInclusion = useCallback(
    (index: number, field: keyof TicketInclusion, value: string) => {
      setInclusions((prev) =>
        prev.map((inc, i) => (i === index ? { ...inc, [field]: value } : inc)),
      )
    },
    [],
  )

  const addFaq = useCallback(() => {
    setFaqs((prev) => [
      ...prev,
      { _key: generateKey(), question: '', answer: '' },
    ])
  }, [])

  const removeFaq = useCallback((index: number) => {
    setFaqs((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const updateFaq = useCallback(
    (index: number, field: keyof TicketFaq, value: string) => {
      setFaqs((prev) =>
        prev.map((faq, i) => (i === index ? { ...faq, [field]: value } : faq)),
      )
    },
    [],
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<DocumentTextIcon />}
        title="Ticket Page Content"
        description="Configure the public tickets page for"
        contextHighlight={conferenceTitle}
        backLink={{ href: '/admin/tickets', label: 'Back to Tickets' }}
        actionItems={[
          {
            label: 'View Public Page',
            href: '/tickets',
            target: '_blank',
            icon: <TicketIcon className="mr-2 h-4 w-4" />,
            variant: 'secondary' as const,
          },
          {
            label: 'Save Changes',
            render: () => (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${
                  saveStatus === 'error'
                    ? 'bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                }`}
              >
                {saving ? (
                  <>
                    <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'success' ? (
                  <>
                    <CheckIcon className="mr-2 h-4 w-4" />
                    Saved
                  </>
                ) : saveStatus === 'error' ? (
                  'Save Failed — Retry'
                ) : (
                  'Save Changes'
                )}
              </button>
            ),
          },
        ]}
      />

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
        {/* Hero Section */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Hero Section
          </h3>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label
                  htmlFor="hero_headline"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Headline
                </label>
                <input
                  id="hero_headline"
                  type="text"
                  value={customization.hero_headline ?? ''}
                  onChange={(e) =>
                    setCustomization((prev) => ({
                      ...prev,
                      hero_headline: e.target.value,
                    }))
                  }
                  placeholder="Tickets (leave blank for default)"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="cta_button_text"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  CTA Button Text
                </label>
                <input
                  id="cta_button_text"
                  type="text"
                  value={customization.cta_button_text ?? ''}
                  onChange={(e) =>
                    setCustomization((prev) => ({
                      ...prev,
                      cta_button_text: e.target.value,
                    }))
                  }
                  placeholder="Register Now (default)"
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="hero_subheadline"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Subheadline
              </label>
              <textarea
                id="hero_subheadline"
                rows={3}
                value={customization.hero_subheadline ?? ''}
                onChange={(e) =>
                  setCustomization((prev) => ({
                    ...prev,
                    hero_subheadline: e.target.value,
                  }))
                }
                placeholder="Leave blank to auto-generate from conference name and dates"
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="show_vanity_metrics"
                type="checkbox"
                checked={customization.show_vanity_metrics ?? false}
                onChange={(e) =>
                  setCustomization((prev) => ({
                    ...prev,
                    show_vanity_metrics: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label
                htmlFor="show_vanity_metrics"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Show vanity metrics bar (attendees, speakers, etc.)
              </label>
            </div>
            {customization.show_vanity_metrics && (
              <div className="ml-7 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700">
                {vanityMetrics.length > 0 ? (
                  <p>
                    Currently configured:{' '}
                    {vanityMetrics
                      .map((m) => `${m.label}: ${m.value}`)
                      .join(', ')}
                    . Edit these in Sanity under Content &amp; Announcements.
                  </p>
                ) : (
                  <p>
                    No vanity metrics configured. Add them in Sanity under
                    Content &amp; Announcements.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Partner Nodes & Sponsor Capacity */}
        <div className="flex flex-col rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Partner Nodes &amp; Sponsor Capacity
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Information about sponsor-exclusive group pricing and partner
            packages. Use double line breaks to separate paragraphs. Leave blank
            to hide this section on the public page.
          </p>
          <textarea
            rows={4}
            value={customization.group_discount_info ?? ''}
            onChange={(e) =>
              setCustomization((prev) => ({
                ...prev,
                group_discount_info: e.target.value,
              }))
            }
            placeholder="e.g., Groups of 5 or more receive a 10% discount. Contact us for details."
            className="mt-3 block w-full flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* What's Included */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 xl:col-span-2 dark:bg-gray-900 dark:ring-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              What&apos;s Included ({inclusions.length})
            </h3>
            <button
              type="button"
              onClick={addInclusion}
              className="inline-flex items-center rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:border-indigo-500 hover:text-indigo-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400"
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Add
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Describe what attendees get with their ticket — keynotes, workshops,
            social events, meals, swag, etc.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {inclusions.map((inclusion, index) => (
              <div
                key={inclusion._key || index}
                className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inclusion.title}
                      onChange={(e) =>
                        updateInclusion(index, 'title', e.target.value)
                      }
                      placeholder="e.g., Conference Sessions"
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                    <select
                      value={inclusion.icon ?? ''}
                      onChange={(e) =>
                        updateInclusion(index, 'icon', e.target.value)
                      }
                      className="w-36 shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">No icon</option>
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="text"
                    value={inclusion.description ?? ''}
                    onChange={(e) =>
                      updateInclusion(index, 'description', e.target.value)
                    }
                    placeholder="Optional description"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeInclusion(index)}
                  className="self-start rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 xl:col-span-2 dark:bg-gray-900 dark:ring-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              FAQs ({faqs.length})
            </h3>
            <button
              type="button"
              onClick={addFaq}
              className="inline-flex items-center rounded-md border border-dashed border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-600 hover:border-indigo-500 hover:text-indigo-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400"
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Add
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Frequently asked questions about tickets and registration.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {faqs.map((faq, index) => (
              <div
                key={faq._key || index}
                className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) =>
                      updateFaq(index, 'question', e.target.value)
                    }
                    placeholder="Question"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => updateFaq(index, 'answer', e.target.value)}
                    placeholder="Answer"
                    className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeFaq(index)}
                  className="self-start rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
