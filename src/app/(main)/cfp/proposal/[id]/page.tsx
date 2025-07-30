import { notFound } from 'next/navigation'
import { getProposalSanity as getProposal } from '@/lib/proposal/server'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ProposalDetail } from '@/components/admin/ProposalDetail'
import Link from 'next/link'
import { ChevronLeftIcon } from '@heroicons/react/20/solid'
import { CFPLayout } from '@/components/cfp/CFPLayout'

interface ProposalViewPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProposalViewPage({
  params,
}: ProposalViewPageProps) {
  const { id } = await params
  const session = await auth()

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/proposal/' + id)
  }

  const { proposal, proposalError } = await getProposal({
    id,
    speakerId: session.speaker._id,
    isOrganizer: false,
  })

  if (proposalError) {
    return (
      <CFPLayout>
        <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
          <h1 className="font-jetbrains text-brand-red text-4xl font-bold tracking-tighter sm:text-6xl">
            Error Loading Proposal
          </h1>
          <p className="font-inter mt-6 text-xl tracking-tight text-brand-slate-gray">
            {proposalError.message}
          </p>
          <Link
            href="/cfp/list"
            className="hover:text-brand-electric-purple mt-8 inline-flex items-center text-brand-cloud-blue transition-colors"
          >
            <ChevronLeftIcon className="mr-2 h-5 w-5" />
            Back to My Proposals
          </Link>
        </div>
      </CFPLayout>
    )
  }

  if (!proposal) {
    notFound()
  }

  return (
    <CFPLayout>
      <div className="mx-auto max-w-2xl lg:max-w-4xl lg:px-12">
        <div className="mb-8">
          <Link
            href="/cfp/list"
            className="hover:text-brand-electric-purple inline-flex items-center text-brand-cloud-blue transition-colors"
          >
            <ChevronLeftIcon className="mr-2 h-5 w-5" />
            Back to My Proposals
          </Link>
        </div>

        <div className="rounded-xl border border-brand-frosted-steel bg-brand-glacier-white p-8 shadow-sm">
          <ProposalDetail proposal={proposal} />
        </div>
      </div>
    </CFPLayout>
  )
}
