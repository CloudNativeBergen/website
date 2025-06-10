'use client'

import { ProposalExisting } from "@/lib/proposal/types";
import { Review } from "@/lib/review/types"
import { StarIcon } from "@heroicons/react/24/solid"
import { ProposalReviewForm } from "@/components/ProposalReviewForm";
import { sanityImage } from "@/lib/sanity/client";
import { Speaker } from "@/lib/speaker/types";
import { useEffect, useState } from "react";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export function ProposalReview({ user, proposal, initialReviews }: { user: Speaker, proposal: ProposalExisting; initialReviews: Review[] }) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews || []);

  const [averageScore, setAverageScore] = useState<{ content: string; relevance: string; speaker: string }>({
    content: '0.0',
    relevance: '0.0',
    speaker: '0.0',
  });

  useEffect(() => {
    const totalScore = reviews.reduce(
      (acc, review) => ({
        content: acc.content + review.score.content,
        relevance: acc.relevance + review.score.relevance,
        speaker: acc.speaker + review.score.speaker,
      }),
      { content: 0, relevance: 0, speaker: 0 }
    );

    setAverageScore({
      content: reviews.length > 0 ? (totalScore.content / reviews.length).toFixed(1) : '0.0',
      relevance: reviews.length > 0 ? (totalScore.relevance / reviews.length).toFixed(1) : '0.0',
      speaker: reviews.length > 0 ? (totalScore.speaker / reviews.length).toFixed(1) : '0.0',
    });
  }, [reviews]);

  const userReview = reviews.find(
    (review) => '_id' in review.reviewer && review.reviewer._id === user._id
  ) || { comment: '', score: { content: 0, relevance: 0, speaker: 0 } };

  function handleReviewUpdate(newReview: Review) {
    newReview.reviewer = user; // Ensure the reviewer is set to the current user

    setReviews((prevReviews) => {
      const existingReviewIndex = prevReviews.findIndex(
        (review) => '_id' in review.reviewer && review.reviewer._id === user._id
      );

      if (existingReviewIndex !== -1) {
        // Update existing review
        const updatedReviews = [...prevReviews];
        updatedReviews[existingReviewIndex] = {
          ...prevReviews[existingReviewIndex],
          comment: newReview.comment,
          score: newReview.score,
        };
        return updatedReviews;
      } else {
        // Add new review
        return [...prevReviews, newReview];
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Add New Review */}
      <div className="space-y-4 border-t border-gray-300 py-6">
        <h3 className="text-lg font-semibold text-gray-800">My Review</h3>
        <ProposalReviewForm
          proposalId={proposal._id}
          review={userReview}
          onReviewSubmit={handleReviewUpdate}
        />
      </div>

      {/* Average Score */}
      <div className="space-y-2 text-sm text-gray-500 border-t border-gray-200 py-6">
        <h3 className="text-lg font-medium text-gray-900">Average Score</h3>
        <div className="mt-2 space-y-1">
          {[
            { key: 'content', label: 'Content' },
            { key: 'relevance', label: 'Relevance' },
            { key: 'speaker', label: 'Speaker' },
          ].map(({ key, label }, idx) => {
            const score = parseFloat(averageScore[key as keyof typeof averageScore]);
            return <ScoreDisplay key={idx} category={label} score={score} />;
          })}
        </div>
      </div>

      {/* Individual Reviews */}
      {reviews.map((review, index) => (
        <div key={index} className="flex space-x-4 text-sm text-gray-500 border-t border-gray-200 py-6">
          <div className="flex-none w-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={
                'image' in review.reviewer && review.reviewer.image
                  ? sanityImage(review.reviewer.image).width(100).url()
                  : `https://placehold.co/40x40?text=${'name' in review.reviewer ? review.reviewer.name.charAt(0) : 'U'}`
              }
              className="h-10 w-10 rounded-full bg-gray-100"
            />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">
              {'name' in review.reviewer ? review.reviewer.name : 'Unknown Reviewer'}
            </h3>
            <div className="mt-2 space-y-1">
              {[
                { key: 'content', label: 'Content' },
                { key: 'relevance', label: 'Relevance' },
                { key: 'speaker', label: 'Speaker' },
              ].map(({ key, label }, idx) => {
                const score = review.score[key as keyof typeof review.score];
                return <ScoreDisplay key={idx} category={label} score={score} showNumber={false} />;
              })}
            </div>
            <div className="mt-2 text-sm text-gray-500">
              <p>{review.comment}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ScoreDisplay({ category, score, showNumber = true }: { category: string; score: number; showNumber?: boolean }) {
  return (
    <div className="flex items-center space-x-4">
      <span className="w-32">{category}</span>
      <div className="flex items-center space-x-2">
        <div className="flex items-center">
          {[0, 1, 2, 3, 4].map((rating) => (
            <StarIcon
              key={rating}
              aria-hidden="true"
              className={classNames(
                score > rating ? 'text-yellow-400' : 'text-gray-300',
                'size-5 shrink-0',
              )}
            />
          ))}
        </div>
        {showNumber && <span>{`(${score})`}</span>}
      </div>
    </div>
  )
}