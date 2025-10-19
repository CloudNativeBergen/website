'use client'

import {
  ProposalInput,
  Language,
  Format,
  Level,
  Audience,
  languages,
  levels,
  formats,
  audiences,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableTextEditor } from '../PortableTextEditor'
import { Dropdown, Multiselect, Textarea, Input } from '../Form'
import { Reference } from 'sanity'

interface ProposalDetailsFormProps {
  proposal: ProposalInput
  onChange: (proposal: ProposalInput) => void
  conference: Conference
  allowedFormats: Format[]
  mode?: 'user' | 'admin'
}

export function ProposalDetailsForm({
  proposal,
  onChange,
  conference,
  allowedFormats,
}: ProposalDetailsFormProps) {
  // Prepare format options based on allowed formats
  const formatOptions = new Map<string, string>()
  allowedFormats.forEach((format) => {
    const label = formats.get(format)
    if (label) formatOptions.set(format, label)
  })

  // Show audiences only for workshop formats
  const showAudiences =
    proposal.format === Format.workshop_120 ||
    proposal.format === Format.workshop_240

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <Input
          name="title"
          label="Title"
          value={proposal.title}
          setValue={(value) => onChange({ ...proposal, title: value })}
          type="text"
        />
      </div>

      {/* Language */}
      <div>
        <Dropdown
          name="language"
          label="Language"
          options={languages}
          value={proposal.language}
          setValue={(value) =>
            onChange({ ...proposal, language: value as Language })
          }
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
          Description
        </label>
        <div className="mt-2 rounded-lg border border-gray-300 p-4 dark:border-gray-600">
          <PortableTextEditor
            label=""
            value={proposal.description as PortableTextBlock[]}
            onChange={(value) => onChange({ ...proposal, description: value })}
          />
        </div>
      </div>

      {/* Format and Level */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Dropdown
            name="format"
            label="Format"
            options={formatOptions}
            value={proposal.format}
            setValue={(value) =>
              onChange({ ...proposal, format: value as Format })
            }
          />
        </div>
        <div>
          <Dropdown
            name="level"
            label="Level"
            options={levels}
            value={proposal.level}
            setValue={(value) =>
              onChange({ ...proposal, level: value as Level })
            }
          />
        </div>
      </div>

      {/* Audiences - only for workshops */}
      {showAudiences && (
        <div>
          <Multiselect
            name="audiences"
            label="Target Audiences"
            options={Array.from(audiences.entries()).map(([id, title]) => ({
              id,
              title,
            }))}
            value={proposal.audiences || []}
            setValue={(value) =>
              onChange({ ...proposal, audiences: value as Audience[] })
            }
            placeholder="Select target audiences"
          />
        </div>
      )}

      {/* Topics */}
      {conference.topics && conference.topics.length > 0 && (
        <div>
          <Multiselect
            name="topics"
            label="Topics"
            options={conference.topics.map((topic) => ({
              id: topic._id,
              title: topic.title,
              color: topic.color,
            }))}
            value={
              proposal.topics
                ?.map((t) => {
                  if (typeof t === 'string') return t
                  if ('_ref' in t) return (t as Reference)._ref
                  if ('_id' in t) return (t as Topic)._id
                  return ''
                })
                .filter(Boolean) || []
            }
            setValue={(value) => {
              // Convert IDs back to Topic array
              const selectedTopics =
                conference.topics?.filter((t) => value.includes(t._id)) || []
              onChange({ ...proposal, topics: selectedTopics })
            }}
            placeholder="Select relevant topics"
          />
        </div>
      )}

      {/* Outline */}
      <div>
        <Textarea
          name="outline"
          label="Outline"
          value={proposal.outline || ''}
          setValue={(value) => onChange({ ...proposal, outline: value })}
          rows={5}
        />
      </div>

      {/* Workshop capacity (only for workshops) */}
      {showAudiences && (
        <div>
          <Input
            name="capacity"
            label="Workshop Capacity (max participants)"
            value={proposal.capacity?.toString() || ''}
            setValue={(value) =>
              onChange({
                ...proposal,
                capacity: value ? parseInt(value, 10) : undefined,
              })
            }
            type="number"
          />
        </div>
      )}

      {/* Video URL (optional) */}
      <div>
        <Input
          name="video"
          label="Video URL (optional)"
          value={proposal.video || ''}
          setValue={(value) => onChange({ ...proposal, video: value })}
          type="url"
        />
      </div>
    </div>
  )
}
