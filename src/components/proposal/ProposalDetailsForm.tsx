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
import Link from 'next/link'
import { useEffect, useState } from 'react'
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
}: {
  proposal: ProposalInput
  setProposal: (proposal: ProposalInput) => void
  conference: Conference
  allowedFormats: Format[]
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

  useEffect(() => {
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

      <div className="mt-10 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
        <div className="col-span-full">
          <Input name="title" label="Title" value={title} setValue={setTitle} />
        </div>

        <div className="sm:col-span-3">
          <Dropdown
            name="language"
            label="Language"
            value={language}
            setValue={setLanguage}
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
            setValue={setFormat}
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
            setValue={setLevel}
            options={levels}
          />
        </div>

        <div className="sm:col-span-full">
          <Multiselect
            name="audiences"
            label="Audience"
            maxItems={5}
            placeholder="Select audience"
            options={Array.from(audiencesMap, ([id, title]) => ({ id, title }))}
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
            options={(conference.topics ?? []).map((topic) => ({
              id: topic._id,
              title: topic.title,
              color: topic.color,
            }))}
            value={topics.map((topic) => topic._id)}
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
            Provide a detailed outline of the content of your presentation. How
            do you plan to structure the presentation and what is the expected
            takeaways for the participants. This will only be visible to the
            organizers and not displayed on the website.
          </HelpText>
        </div>

        <div className="col-span-full">
          <Checkbox
            name="tos"
            label="I agree to the Cloud Native Bergen Code of Conduct"
            value={tos}
            setValue={setTos}
          >
            <HelpText>
              You must agree to the{' '}
              <Link
                href="/conduct"
                className="text-brand-cloud-blue underline hover:text-brand-cloud-blue-hover"
              >
                Cloud Native Bergen Code of Conduct
              </Link>{' '}
              to submit your presentation.
            </HelpText>
          </Checkbox>
        </div>
      </div>
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
