import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/sanity'
import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ProposalDetail } from '@/components/ProposalDetail'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

interface ProposalViewPageProps {
  params: {
    id: string
  }
}

export default async function ProposalViewPage({ params }: ProposalViewPageProps) {
  const session = await auth()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const { proposal, proposalError } = await getProposal({
    id: params.id,
    speakerId: session.speaker._id,
  })

  if (proposalError || !proposal) {
    return (
      <div className="relative py-20 sm:pt-36 sm:pb-24">
        <BackgroundImage className="-top-36 -bottom-14" />
        <Container className="relative">
          <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
            <div className="text-center">
              <h1 className="font-jetbrains text-2xl font-bold text-red-500">
                Proposal Not Found
              </h1>
              <p className="font-inter mt-4 text-gray-600">
                The proposal you're looking for doesn't exist or you don't have permission to view it.
              </p>
              <Link
                href="/cfp/list"
                className="font-inter mt-6 inline-flex items-center rounded-md bg-brand-cloud-blue px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90"
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Back to Proposals
              </Link>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  // Check if the user has permission to view this proposal
  const isOwner = proposal.speaker &&
    typeof proposal.speaker === 'object' &&
    'name' in proposal.speaker &&
    proposal.speaker._id === session.speaker._id
  
  const isCoSpeaker = proposal.coSpeakers?.some(coSpeaker =>
    typeof coSpeaker === 'object' &&
    'name' in coSpeaker &&
    coSpeaker._id === session.speaker?._id
  )

  if (!isOwner && !isCoSpeaker) {
    return redirect('/cfp/list')
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          {/* Header with back button */}
          <div className="mb-8">
            <Link
              href="/cfp/list"
              className="font-inter inline-flex items-center text-sm text-brand-cloud-gray transition-colors hover:text-brand-cloud-blue"
            >
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Back to Proposals
            </Link>
          </div>

          {/* Proposal Detail Component */}
          <ProposalDetail proposal={proposal} />
        </div>
      </Container>
    </div>
  )
}