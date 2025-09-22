'use client'

import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

interface ExpandableEmailTemplateProps {
  children: React.ReactNode
  previewHeight?: number
  title: string
  description: string
  className?: string

  emailFrom: string
  emailTo: string
  emailSubject: string
  emailTime: string
}

export default function ExpandableEmailTemplate({
  children,
  previewHeight = 400,
  title,
  description,
  className = '',
  emailFrom,
  emailTo,
  emailSubject,
  emailTime,
}: ExpandableEmailTemplateProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={className}>
      <h4 className="font-space-grotesk mb-4 text-xl font-semibold">{title}</h4>
      <p className="font-inter mb-6 text-sm text-brand-slate-gray">
        {description}
      </p>

      <div className="relative">
        <div
          className={`overflow-hidden rounded-xl bg-gray-100 shadow-2xl transition-all duration-700 ease-in-out ${
            isExpanded ? 'max-h-[2000px]' : ''
          }`}
          style={{
            maxHeight: isExpanded ? '2000px' : `${previewHeight}px`,
          }}
        >
          <div className="rounded-xl bg-gray-100 shadow-2xl">
            <div className="rounded-t-lg bg-gray-200 px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="h-3 w-3 rounded-full bg-red-500"></div>
                  <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                  <div className="h-3 w-3 rounded-full bg-green-500"></div>
                </div>
                <div className="font-inter text-sm font-medium text-gray-600">
                  Mail
                </div>
                <div className="w-16"></div>
              </div>
            </div>

            <div className="border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-4">
                  <span className="font-semibold text-gray-900">From:</span>
                  <span className="text-gray-600">{emailFrom}</span>
                </div>
                <div className="text-xs text-gray-500">{emailTime}</div>
              </div>
              <div className="mt-1 flex items-center space-x-4 text-sm">
                <span className="font-semibold text-gray-900">To:</span>
                <span className="text-gray-600">{emailTo}</span>
              </div>
              <div className="mt-2">
                <h5 className="font-semibold text-gray-900">{emailSubject}</h5>
              </div>
            </div>

            <div className="rounded-b-lg bg-white p-6">{children}</div>
          </div>
        </div>

        {!isExpanded && (
          <div className="absolute right-0 bottom-0 left-0">
            <div className="pointer-events-none h-16 bg-gradient-to-t from-gray-100 via-gray-100/90 to-transparent" />

            <div className="flex justify-center bg-gray-100 px-4 py-4">
              <button
                onClick={() => setIsExpanded(true)}
                className="group flex items-center space-x-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-cloud-blue shadow-md transition-all duration-300 hover:scale-105 hover:bg-brand-cloud-blue hover:text-white hover:shadow-lg"
              >
                <span>View Full Template</span>
                <ChevronDownIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
              </button>
            </div>
          </div>
        )}

        {isExpanded && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setIsExpanded(false)}
              className="group flex items-center space-x-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-brand-cloud-blue shadow-md transition-all duration-300 hover:scale-105 hover:bg-brand-cloud-blue hover:text-white hover:shadow-lg"
            >
              <span>Collapse Template</span>
              <ChevronUpIcon className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
