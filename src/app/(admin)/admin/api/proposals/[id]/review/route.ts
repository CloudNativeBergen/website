import { NextAuthRequest, auth } from '@/lib/auth'
import { checkOrganizerAccess } from '@/lib/auth/admin'
import { getProposalSanity } from '@/lib/proposal/server'
import { ReviewBase } from '@/lib/review/types'
import { createReview, updateReview } from '@/lib/review/sanity'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export const POST = auth(
  async (
    req: NextAuthRequest,
    context: { params: Promise<{ id: string }> },
  ) => {
    // This needs to be awaited – do not remove
    // https://stackoverflow.com/questions/79145063/params-should-be-awaited-nextjs15
    const { id } = await context.params

    const accessError = checkOrganizerAccess(req)
    if (accessError) {
      return accessError
    }

    const data = (await req.json()) as ReviewBase

    const { proposal: existingProposal, proposalError: checkErr } =
      await getProposalSanity({
        id: id,
        speakerId: req.auth!.speaker._id,
        isOrganizer: req.auth!.speaker.is_organizer,
        includeReviews: true,
      })
    if (checkErr || !existingProposal) {
      return NextResponse.json(
        {
          error: checkErr,
          message: checkErr
            ? 'Error fetching proposal from database'
            : 'Proposal not found',
          type: checkErr ? 'server' : 'not_found',
          status: checkErr ? 500 : 404,
        },
        {
          status: checkErr ? 500 : 404,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const userReview = existingProposal.reviews?.find(
      (review) =>
        'email' in review.reviewer &&
        review.reviewer._id === req.auth!.speaker._id,
    )

    const reviewOperation = userReview
      ? updateReview(userReview._id, req.auth!.speaker._id, data)
      : createReview(existingProposal._id, req.auth!.speaker._id, data)

    const { review, reviewError } = await reviewOperation

    if (reviewError) {
      return NextResponse.json(
        {
          error: reviewError,
          message: `Error ${userReview ? 'updating' : 'creating'} review`,
          type: 'server',
          status: 500,
        },
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    return NextResponse.json(
      {
        review,
        message: `Review ${userReview ? 'updated' : 'created'} successfully`,
        status: userReview ? 200 : 201,
      },
      {
        status: userReview ? 200 : 201,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  },
)
