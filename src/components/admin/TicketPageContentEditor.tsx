'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  ArrowPathIcon,
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
  initialCustomization: Partial<TicketCustomization>
  initialInclusions: TicketInclusion[]
  initialFaqs: TicketFaq[]
  vanityMetrics: ConferenceVanityMetric[]
}

export function TicketPageContentEditor({
  conferenceId,
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
    <div className="mt-8 space-y-8">
      {/* Hero Customization */}
      <CollapsibleSection title="Hero Section" defaultOpen={true}>
        <div className="space-y-4">
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
            <div className="ml-7 rounded-md bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
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
                  No vanity metrics configured. Add them in Sanity under Content
                  &amp; Announcements.
                </p>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* What's Included */}
      <CollapsibleSection
        title={`What's Included (${inclusions.length} items)`}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Describe what attendees get with their ticket — keynotes, workshops,
            social events, meals, swag, etc.
          </p>
          {inclusions.map((inclusion, index) => (
            <div
              key={inclusion._key || index}
              className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={inclusion.title}
                      onChange={(e) =>
                        updateInclusion(index, 'title', e.target.value)
                      }
                      placeholder="e.g., Conference Sessions"
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div className="w-40">
                    <select
                      value={inclusion.icon ?? ''}
                      onChange={(e) =>
                        updateInclusion(index, 'icon', e.target.value)
                      }
                      className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">No icon</option>
                      {ICON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <textarea
                  rows={2}
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
          <button
            type="button"
            onClick={addInclusion}
            className="inline-flex items-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-indigo-500 hover:text-indigo-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Add Inclusion
          </button>
        </div>
      </CollapsibleSection>

      {/* Partner Nodes & Sponsor Capacity */}
      <CollapsibleSection
        title="Partner Nodes & Sponsor Capacity"
        defaultOpen={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
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
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
      </CollapsibleSection>

      {/* FAQs */}
      <CollapsibleSection
        title={`FAQs (${faqs.length} items)`}
        defaultOpen={true}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Frequently asked questions about tickets and registration.
          </p>
          {faqs.map((faq, index) => (
            <div
              key={faq._key || index}
              className="flex gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="min-w-0 flex-1 space-y-3">
                <input
                  type="text"
                  value={faq.question}
                  onChange={(e) => updateFaq(index, 'question', e.target.value)}
                  placeholder="Question"
                  className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium shadow-sm focus:border-indigo-500 focus:ring-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
                <textarea
                  rows={3}
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
          <button
            type="button"
            onClick={addFaq}
            className="inline-flex items-center rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-indigo-500 hover:text-indigo-500 dark:border-gray-600 dark:text-gray-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Add FAQ
          </button>
        </div>
      </CollapsibleSection>

      {/* Save Button */}
      <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {saveStatus === 'success' && (
              <span className="flex items-center text-green-600 dark:text-green-400">
                <CheckIcon className="mr-1 h-4 w-4" />
                Saved successfully
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-red-600 dark:text-red-400">
                Failed to save. Please try again.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {saving ? (
              <>
                <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
