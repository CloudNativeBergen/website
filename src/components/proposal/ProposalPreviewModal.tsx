'use client';

import { ProposalExisting } from '@/lib/proposal/types';
import { Speaker } from '@/lib/speaker/types';
import { FormatFormat, FormatLanguage, FormatLevel, FormatStatus } from '@/lib/proposal/format';
import { getAverageScore, getScoreColorClass } from '@/utils/reviewUtils';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Fragment, memo } from 'react';
import { PortableText } from '@portabletext/react';

interface ProposalPreviewModalProps {
  proposal: ProposalExisting | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ProposalPreviewModal = memo(({ proposal, isOpen, onClose }: ProposalPreviewModalProps) => {
  if (!proposal) return null;

  const averageScore = proposal.reviews ? getAverageScore(proposal.reviews) : 0;
  const scoreColorClass = getScoreColorClass(averageScore);
  const speakerName = proposal.speaker && 'name' in proposal.speaker
    ? (proposal.speaker as Speaker).name
    : 'Unknown speaker';

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="mt-3 w-full text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <DialogTitle as="h3" className="text-lg font-semibold leading-6 text-gray-900 pr-8">
                      {proposal.title}
                    </DialogTitle>

                    <div className="mt-4 space-y-4">
                      {/* Speaker and Basic Info */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Speaker</dt>
                          <dd className="mt-1 text-sm text-gray-900">{speakerName}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Format</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <FormatFormat format={proposal.format} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Language</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <FormatLanguage language={proposal.language} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Level</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <FormatLevel level={proposal.level} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Status</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            <FormatStatus status={proposal.status} />
                          </dd>
                        </div>
                        {proposal.reviews && proposal.reviews.length > 0 && (
                          <div>
                            <dt className="text-sm font-medium text-gray-500">Review Score</dt>
                            <dd className={`mt-1 text-sm font-medium ${scoreColorClass}`}>
                              {averageScore.toFixed(1)} ({proposal.reviews.length} review{proposal.reviews.length !== 1 ? 's' : ''})
                            </dd>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      {proposal.description && proposal.description.length > 0 && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Description</dt>
                          <dd className="mt-1 text-sm text-gray-900 prose prose-sm max-w-none">
                            <PortableText value={proposal.description} />
                          </dd>
                        </div>
                      )}

                      {/* Outline */}
                      {proposal.outline && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Outline</dt>
                          <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{proposal.outline}</dd>
                        </div>
                      )}

                      {/* Audiences */}
                      {proposal.audiences && proposal.audiences.length > 0 && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Target Audience</dt>
                          <dd className="mt-1">
                            <div className="flex flex-wrap gap-2">
                              {proposal.audiences.map((audience, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
                                >
                                  {audience}
                                </span>
                              ))}
                            </div>
                          </dd>
                        </div>
                      )}

                      {/* Topics */}
                      {proposal.topics && proposal.topics.length > 0 && (
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Topics</dt>
                          <dd className="mt-1">
                            <div className="flex flex-wrap gap-2">
                              {proposal.topics.map((topic, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"
                                >
                                  {typeof topic === 'object' && 'title' in topic ? topic.title : 'Topic'}
                                </span>
                              ))}
                            </div>
                          </dd>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        onClick={onClose}
                      >
                        Close
                      </button>
                      <a
                        href={`/cfp/admin/${proposal._id}/view`}
                        className="inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                      >
                        Full Review
                      </a>
                    </div>
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
});

ProposalPreviewModal.displayName = 'ProposalPreviewModal';
