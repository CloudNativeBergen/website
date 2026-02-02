'use client'

import { Conference } from '@/lib/conference/types'
import {
  Audience,
  audiences as audiencesMap,
  Format,
  formats,
  Language,
  languages,
  Level,
  levels,
  ProposalInput,
} from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'
import { PortableTextBlock } from '@portabletext/editor'
import { PortableText } from '@portabletext/react'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import {
  Checkbox,
  Dropdown,
  HelpText,
  Input,
  Multiselect,
  Textarea,
} from '../Form'
import { PortableTextEditor } from '../PortableTextEditor'

export function ProposalDetailsForm({
  proposal,
  setProposal,
  conference,
  allowedFormats,
  readOnly = false,
}: {
  proposal: ProposalInput
  setProposal: (proposal: ProposalInput) => void
  conference: Conference
  allowedFormats: Format[]
  readOnly?: boolean
}) {
  const [title, setTitle] = useState(proposal?.title ?? '')
  const [language, setLanguage] = useState(
    proposal?.language ?? Language.norwegian,
  )
  const [description, setDescription] = useState(proposal?.description ?? [])
  const [format, setFormat] = useState(proposal?.format ?? Format.lightning_10)
  const [level, setLevel] = useState(proposal?.level ?? Level.beginner)
  const [audiences, setAudiences] = useState<Audience[]>(
    proposal?.audiences ?? [],
  )
  const [topics, setTopics] = useState<Topic[]>(
    Array.isArray(proposal?.topics)
      ? proposal.topics.filter((topic): topic is Topic => '_id' in topic)
      : [],
  )
  const [outline, setOutline] = useState(proposal?.outline ?? '')
  const [tos, setTos] = useState(proposal?.tos ?? false)

  // Use a ref to track if we're syncing from props to avoid circular updates
  const isSyncingFromProps = useRef(false)

  // Sync local state when proposal prop changes (e.g., when editing a different proposal)
  useEffect(() => {
    isSyncingFromProps.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initialize form from proposal data
    setTitle(proposal?.title ?? '')
    setLanguage(proposal?.language ?? Language.norwegian)
    setDescription(proposal?.description ?? [])
    setFormat(proposal?.format ?? Format.lightning_10)
    setLevel(proposal?.level ?? Level.beginner)
    setAudiences(proposal?.audiences ?? [])
    setTopics(
      Array.isArray(proposal?.topics)
        ? proposal.topics.filter((topic): topic is Topic => '_id' in topic)
        : [],
    )
    setOutline(proposal?.outline ?? '')
    setTos(proposal?.tos ?? false)
    // Use setTimeout to ensure all state updates complete before clearing the flag
    setTimeout(() => {
      isSyncingFromProps.current = false
    }, 0)
  }, [proposal])

  // Only update parent when local state changes (not when syncing from props)
  useEffect(() => {
    if (!isSyncingFromProps.current) {
      setProposal({
        title,
        language,
        description,
        format,
        level,
        audiences,
        topics,
        outline,
        tos,
      })
    }
  }, [
    title,
    language,
    description,
    format,
    level,
    audiences,
    topics,
    outline,
    tos,
    setProposal,
  ])

  return (
    <div className="border-b border-brand-frosted-steel pb-12 dark:border-gray-600">
      <h2 className="text-lg leading-7 font-semibold text-gray-900 dark:text-white">
        Presentation Details
      </h2>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
        Please provide the following details about your presentation.
      </p>

      {readOnly ? (
        <div className="mt-10 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Title
            </label>
            <p className="mt-2 text-gray-900 dark:text-white">{title}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Language
            </label>
            <p className="mt-2 text-gray-900 dark:text-white">
              {languages.get(language)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Abstract
            </label>
            <div className="prose prose-sm dark:prose-invert mt-2 max-w-none text-gray-900 dark:text-white">
              {description && description.length > 0 ? (
                <PortableText value={description} />
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  No abstract provided
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Presentation Format
              </label>
              <p className="mt-2 text-gray-900 dark:text-white">
                {formats.get(format)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Skill Level
              </label>
              <p className="mt-2 text-gray-900 dark:text-white">
                {levels.get(level)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Audience
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {audiences.length > 0 ? (
                audiences.map((aud) => (
                  <span
                    key={aud}
                    className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-sm font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {audiencesMap.get(aud)}
                  </span>
                ))
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  None selected
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Topics
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {topics.length > 0 ? (
                topics.map((topic) => (
                  <span
                    key={topic._id}
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-sm font-medium"
                    style={{
                      backgroundColor: topic.color + '20',
                      color: topic.color,
                    }}
                  >
                    {topic.title}
                  </span>
                ))
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  None selected
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Outline (not public)
            </label>
            <p className="mt-2 whitespace-pre-wrap text-gray-900 dark:text-white">
              {outline || 'No outline provided'}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
          <div className="sm:col-span-4">
            <Input
              name="title"
              label="Title"
              value={title}
              setValue={setTitle}
            />
          </div>

          <div className="sm:col-span-2">
            <Dropdown
              name="language"
              label="Language"
              value={language}
              setValue={(val) => setLanguage(val as Language)}
              options={languages}
            />
          </div>

          <div className="col-span-full">
            <DescriptionField
              description={description}
              setDescription={setDescription}
            />
          </div>

          <div className="sm:col-span-3">
            <Dropdown
              name="format"
              label="Presentation Format"
              value={format}
              setValue={(val) => setFormat(val as Format)}
              options={
                new Map(
                  Array.from(formats).filter(([key]) =>
                    allowedFormats.includes(key as Format),
                  ),
                )
              }
            />
          </div>

          <div className="sm:col-span-3">
            <Dropdown
              name="level"
              label="Skill Level"
              value={level}
              setValue={(val) => setLevel(val as Level)}
              options={levels}
            />
          </div>

          <div className="sm:col-span-full">
            <Multiselect
              name="audiences"
              label="Audience"
              maxItems={5}
              placeholder="Select audience"
              options={Array.from(audiencesMap, ([id, title]) => ({
                id,
                title,
              }))}
              value={audiences as string[]}
              setValue={(val: string[]) => setAudiences(val as Audience[])}
            />
          </div>

          <div className="sm:col-span-full">
            <Multiselect
              name="topics"
              label="Topics"
              maxItems={2}
              placeholder="Select topics"
              options={(conference.topics ?? [])
                .filter((topic) => topic._id && topic.title)
                .map((topic) => ({
                  id: topic._id,
                  title: topic.title,
                  color: topic.color,
                }))}
              value={topics
                .filter((topic) => topic && topic._id)
                .map((topic) => topic._id)}
              setValue={(val: string[]) => {
                const selectedTopics = val
                  .map((id) =>
                    conference.topics?.find((topic) => topic._id === id),
                  )
                  .filter((topic): topic is Topic => !!topic)
                setTopics(selectedTopics)
              }}
            />
          </div>

          <div className="col-span-full">
            <Textarea
              name="outline"
              label="Outline (not public)"
              rows={3}
              value={outline}
              setValue={setOutline}
            />
            <HelpText>
              Provide a detailed outline of the content of your presentation.
              How do you plan to structure the presentation and what is the
              expected takeaways for the participants. This will only be visible
              to the organizers and not displayed on the website.
            </HelpText>
          </div>

          <div className="col-span-full">
            <Checkbox
              name="tos"
              label="I agree to the Code of Conduct"
              value={tos}
              setValue={setTos}
            >
              <HelpText>
                You must agree to the{' '}
                <Link
                  href="/conduct"
                  className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
                >
                  Code of Conduct
                </Link>{' '}
                to submit your presentation.
              </HelpText>
            </Checkbox>
          </div>
        </div>
      )}
    </div>
  )
}

function DescriptionField({
  description,
  setDescription,
}: {
  description: PortableTextBlock[] | undefined
  setDescription: (value: PortableTextBlock[]) => void
}) {
  return (
    <PortableTextEditor
      label="Abstract"
      value={description}
      onChange={setDescription}
      helpText={
        <>
          This is what will be displayed to the audience on the conference
          website. It should make the reader want to attend your presentation.
        </>
      }
    />
  )
}
