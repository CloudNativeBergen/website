/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { api } from '@/lib/trpc/client'
import {
  UserGroupIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

interface SponsorContactsWidgetProps {
  sponsorId: string
  onEdit: () => void
}

export function SponsorContactsWidget({
  sponsorId,
  onEdit,
}: SponsorContactsWidgetProps) {
  const { data, isLoading, error } = api.sponsor.crm.getContacts.useQuery({
    id: sponsorId,
  })

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 h-6 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="mb-2 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to load contacts.
        </p>
      </div>
    )
  }

  const contacts = data.contactPersons || []
  const hasBilling = !!data.billing?.email

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <UserGroupIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-base leading-7 font-semibold text-gray-900 dark:text-white">
            Contacts & Billing
          </h2>
        </div>
        <button
          onClick={onEdit}
          className="text-sm font-medium text-brand-cloud-blue hover:text-indigo-500 dark:text-indigo-400"
        >
          Manage
        </button>
      </div>

      <div className="p-6">
        {contacts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
            No contacts configured
          </div>
        ) : (
          <ul className="space-y-4">
            {contacts.map((contact: any) => (
              <li key={contact._key} className="flex flex-col">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {contact.name}
                </span>
                <span className="text-sm text-gray-500">{contact.email}</span>
                {contact.role && (
                  <span className="text-xs text-gray-400">{contact.role}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-700">
          <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            Billing Information
          </h3>
          {hasBilling ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p>Email: {data.billing.email}</p>
              <p>Format: {data.billing.invoiceFormat}</p>
              {data.billing.reference && <p>Ref: {data.billing.reference}</p>}
            </div>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Missing billing info
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
