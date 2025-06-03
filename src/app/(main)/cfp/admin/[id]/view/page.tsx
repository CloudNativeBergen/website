import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { getProposal } from '@/lib/proposal/sanity'
import { audiences, formats, languages, levels, statuses } from '@/lib/proposal/types'
import { flags } from '@/lib/speaker/types'
import { PortableText } from '@portabletext/react'

type Props = {
  params: Promise<{ id: string }>
}

export default async function AdminViewProposal({ params }: Props) {
  const resolvedParams = await params
  const { proposal, err: proposalError } = await getProposal(resolvedParams.id, '', true)

  if (!proposal || proposalError) {
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-red-500">Proposal not found</h1>
      </Container>
    )
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="absolute inset-x-0 -top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-display text-5xl font-bold tracking-tight text-blue-600 sm:text-7xl">
            View Proposal
          </h1>
          <div className="mt-6 space-y-6 font-display text-2xl tracking-tight text-blue-900">
            <p>
              Review the details of the submitted proposal below. Ensure all information is accurate and complete.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-2xl rounded-lg bg-white shadow-lg p-6 lg:max-w-4xl lg:px-12">
          <div className="relative z-10">
            <h1 className="text-3xl font-bold mb-6">{proposal.title}</h1>
            <div className='space-y-4 mb-6'>
              <h2 className="text-xl font-semibold">Description</h2>
              <PortableText value={proposal.description} />
            </div>
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Language</h2>
                  <p className="text-gray-900">{languages.get(proposal.language)}</p>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Format</h2>
                  <p className="text-gray-900">{formats.get(proposal.format)}</p>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Level</h2>
                  <p className="text-gray-900">{levels.get(proposal.level)}</p>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-medium text-gray-700">Audiences</h2>
                <ul className="list-disc pl-5 text-gray-900">
                  {proposal.audiences.map((audience, index) => (
                    <li key={index}>{audiences.get(audience)}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-lg font-medium text-gray-700">Outline</h2>
                <div className="text-gray-900">
                  {proposal.outline && proposal.outline.trim() !== '' ? (
                    proposal.outline.split('\n').map((line, index) => (
                      <div key={index} className="mb-2">
                        {line}
                      </div>
                    ))
                  ) : (
                    'No outline available'
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-lg font-medium text-gray-700">Topics</h2>
                <ul className="list-disc pl-5 text-gray-900">
                  {proposal.topics && proposal.topics.length > 0 ? (
                    proposal.topics.map((topic, index) => (
                      <li key={index}>
                        {'title' in topic ? String(topic.title) : 'Unknown topic'}
                      </li>
                    ))
                  ) : (
                    <li>No topics available</li>
                  )}
                </ul>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Terms of Service</h2>
                  <p className="text-gray-900">{proposal.tos ? 'Accepted' : 'Not Accepted'}</p>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Status</h2>
                  <p className="text-gray-900">{statuses.get(proposal.status)}</p>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-medium text-gray-700">Speaker</h2>
                {proposal.speaker && 'name' in proposal.speaker ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                      <div>
                        <h3 className="text-base font-medium text-gray-700">Name</h3>
                        <p className="text-gray-900">{proposal.speaker.name}</p>
                      </div>
                      <div>
                        <h3 className="text-base font-medium text-gray-700">Email</h3>
                        <p className="text-gray-900">{proposal.speaker.email}</p>
                      </div>
                      {proposal.speaker.title && (
                        <div>
                          <h3 className="text-base font-medium text-gray-700">Title</h3>
                          <p className="text-gray-900">{proposal.speaker.title}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-gray-700">Bio</h3>
                      {proposal.speaker.bio && proposal.speaker.bio.split('\n').map((line, index) => (
                        <p key={index} className="mb-2">
                          {line}
                        </p>
                      ))}
                    </div>
                    {proposal.speaker.links && proposal.speaker.links.length > 0 && (
                      <div>
                        <h3 className="text-base font-medium text-gray-700">Links</h3>
                        <ul className="list-disc pl-5 text-blue-600">
                          {proposal.speaker.links.map((link, index) => (
                            <li key={index}>
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                {link}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {proposal.speaker.flags && proposal.speaker.flags.length > 0 && (
                      <div>
                        <h3 className="text-base font-medium text-gray-700">Flags</h3>
                        <ul className="list-disc pl-5 text-gray-900">
                          {proposal.speaker.flags.map((flag, index) => (
                            <li key={index}>{flags.get(flag)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-900">Speaker information not available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Container >
    </div >
  )
}
