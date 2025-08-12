'use client'

import { SponsorWithContactInfo, ContactPerson } from '@/lib/sponsor/types'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useState } from 'react'

interface SponsorContactTableProps {
  sponsors: SponsorWithContactInfo[]
}

const CopyEmailButton = ({ email }: { email: string }) => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  return (
    <button
      onClick={copyToClipboard}
      className="ml-2 p-1 text-gray-400 transition-colors hover:text-gray-600"
      title={copied ? 'Copied!' : 'Copy email'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

// Create unrolled contact rows for table display
interface ContactRow {
  sponsor: SponsorWithContactInfo
  contact: ContactPerson
  isFirstContactForSponsor: boolean
}

export function SponsorContactTable({ sponsors }: SponsorContactTableProps) {
  // Create unrolled contact rows
  const contactRows: ContactRow[] = []

  sponsors.forEach((sponsor) => {
    if (sponsor.contact_persons && sponsor.contact_persons.length > 0) {
      sponsor.contact_persons.forEach((contact, index) => {
        contactRows.push({
          sponsor,
          contact,
          isFirstContactForSponsor: index === 0,
        })
      })
    } else {
      // Add row for sponsors without contacts to still show them
      contactRows.push({
        sponsor,
        contact: {
          _key: 'no-contact',
          name: '',
          email: '',
        },
        isFirstContactForSponsor: true,
      })
    }
  })

  if (contactRows.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No sponsors found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          No sponsors were found for this conference.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Sponsor
            </th>
            <th
              scope="col"
              className="w-1/5 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Contact Name
            </th>
            <th
              scope="col"
              className="w-1/4 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Contact Email
            </th>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Phone
            </th>
            <th
              scope="col"
              className="w-1/12 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Role
            </th>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Billing Info
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {contactRows.map((row, index) => (
            <tr
              key={`${row.sponsor._id}-${row.contact._key}-${index}`}
              className="hover:bg-gray-50"
            >
              <td className="px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {row.sponsor.name}
                  </div>
                  {row.sponsor.org_number && (
                    <div className="text-xs text-gray-500">
                      Org: {row.sponsor.org_number}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                {row.contact.name ? (
                  <div className="text-sm text-gray-900">
                    {row.contact.name}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    No contact person
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {row.contact.email ? (
                  <div className="flex items-center">
                    <a
                      href={`mailto:${row.contact.email}`}
                      className="text-sm text-gray-900 hover:text-blue-600"
                      title={row.contact.email}
                    >
                      {row.contact.email}
                    </a>
                    <CopyEmailButton email={row.contact.email} />
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">No email</div>
                )}
              </td>
              <td className="px-4 py-3">
                {row.contact.phone ? (
                  <a
                    href={`tel:${row.contact.phone}`}
                    className="text-sm text-gray-900 hover:text-blue-600"
                    title={row.contact.phone}
                  >
                    {row.contact.phone}
                  </a>
                ) : (
                  <div className="text-sm text-gray-500 italic">No phone</div>
                )}
              </td>
              <td className="px-4 py-3">
                {row.contact.role ? (
                  <div className="text-sm text-gray-900">
                    {row.contact.role}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic">No role</div>
                )}
              </td>
              <td className="px-4 py-3">
                {row.isFirstContactForSponsor && (
                  <div className="space-y-1">
                    {row.sponsor.billing && row.sponsor.billing.email ? (
                      <>
                        <div className="flex items-center text-sm text-gray-900">
                          <EnvelopeIcon className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                          <a
                            href={`mailto:${row.sponsor.billing.email}`}
                            className="truncate hover:text-blue-600"
                            title={row.sponsor.billing.email}
                          >
                            {row.sponsor.billing.email}
                          </a>
                          <CopyEmailButton email={row.sponsor.billing.email} />
                        </div>
                        {row.sponsor.billing.reference && (
                          <div className="text-xs text-gray-500">
                            Ref: {row.sponsor.billing.reference}
                          </div>
                        )}
                        {row.sponsor.billing.comments && (
                          <div className="max-h-8 overflow-hidden text-xs text-gray-500">
                            {row.sponsor.billing.comments}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-500 italic">
                        No billing information
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
