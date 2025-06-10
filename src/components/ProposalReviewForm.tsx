'use client';

import { fetchNextUnreviewedProposal } from "@/lib/proposal/client";
import { postReview } from "@/lib/review/client";
import { Review, ReviewBase } from "@/lib/review/types";
import { ArrowRightIcon, PaperAirplaneIcon, StarIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useState } from "react";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export function ProposalReviewForm({
  proposalId,
  review,
  onReviewSubmit
}: {
  proposalId: string;
  review: ReviewBase;
  onReviewSubmit: (newReview: Review) => void
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<{ content: number; relevance: number; speaker: number }>(review.score);
  const [hovered, setHovered] = useState<{ content: number; relevance: number; speaker: number }>({
    content: 0,
    relevance: 0,
    speaker: 0,
  });
  const [comment, setComment] = useState<string>(review.comment);
  const [isLoadingNext, setIsLoadingNext] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const submitHandler = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const reviewData: ReviewBase = {
      comment,
      score: ratings,
    };
    const res = await postReview(proposalId, reviewData);

    if (res.reviewError || !res.review) {
      console.error('Error submitting review:', res.reviewError);
      setIsSubmitting(false);
      return;
    }

    onReviewSubmit(res.review);
    setIsSubmitting(false);
  };

  const handleNextProposal = async () => {
    setIsLoadingNext(true);
    try {
      const { nextProposal, error } = await fetchNextUnreviewedProposal(proposalId);

      if (error) {
        console.error('Error fetching next unreviewed proposal:', error);
        alert('Failed to fetch next unreviewed proposal.');
        setIsLoadingNext(false);
        return;
      }

      if (nextProposal) {
        // Navigate to the next unreviewed proposal
        router.push(`/admin/proposals/${nextProposal._id}`);
      } else {
        // Show notification that there are no more unreviewed proposals
        alert('No more unreviewed proposals available.');
        setIsLoadingNext(false);
      }
    } catch (error) {
      console.error('Error fetching next unreviewed proposal:', error);
      alert('Failed to fetch next unreviewed proposal.');
      setIsLoadingNext(false);
    }
  };

  return (
    <form className="space-y-4">
      <div>
        <label htmlFor="comment" className="block text-sm font-medium text-gray-700">
          Comment
        </label>
        <div className="mt-2">
          <textarea
            id="comment"
            name="comment"
            rows={4}
            className="block w-full rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm"
            placeholder="Write your internal review here..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          ></textarea>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Scores</label>
        <div className="grid grid-cols-1 gap-4 mt-2">
          {[
            { key: 'content', label: 'Content Quality' },
            { key: 'relevance', label: 'Relevance' },
            { key: 'speaker', label: 'Speaker' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <div className="text-5xl flex flex-row-reverse gap-1 text-amber-950">
                {[5, 4, 3, 2, 1].map((star) => (
                  <a
                    key={star}
                    id={`rate-${star}`}
                    href={`#${star}`}
                    className={`transition-all peer hover:text-yellow-500 peer-hover:text-yellow-500 cursor-pointer ${(hovered[key as keyof typeof hovered] || ratings[key as keyof typeof ratings]) >= star
                      ? 'text-yellow-500'
                      : 'text-gray-300'
                      }`}
                    onMouseEnter={() => {
                      setHovered((h) => ({ ...h, [key]: star }));
                    }}
                    onMouseLeave={() => {
                      setHovered((h) => ({ ...h, [key]: 0 }));
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      setRatings((r) => ({ ...r, [key]: star }));
                    }}
                  >
                    <StarIcon
                      key={star}
                      aria-hidden="true"
                      className={classNames(
                        (hovered[key as keyof typeof hovered] || ratings[key as keyof typeof ratings]) >= star
                          ? 'text-yellow-400'
                          : 'text-gray-300',
                        'size-5 shrink-0',
                      )}
                    />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div >
      <div className="flex justify-center">
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={handleNextProposal}
            disabled={isLoadingNext}
            className="relative inline-flex items-center gap-x-1.5 rounded-md bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 ring-1 ring-gray-200 ring-inset hover:bg-gray-300 focus:z-10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightIcon aria-hidden="true" className="-ml-0.5 size-5 text-gray-600" />
            {isLoadingNext ? 'Loading...' : 'Next'}
          </button>
          <button
            type="submit"
            onClick={submitHandler}
            disabled={isSubmitting}
            className="relative inline-flex items-center gap-x-1.5 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white ring-1 ring-indigo-500 ring-inset hover:bg-indigo-600 focus:z-10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon aria-hidden="true" className="-ml-0.5 size-5 text-white" />
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </form>
  );
}