import {
  buildPricingMatrix,
  formatTicketPrice,
  getTicketSaleStatus,
  type PublicTicketType,
} from '@/lib/tickets/public'
import { TicketIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface TicketPricingGridProps {
  tickets: PublicTicketType[]
  registrationLink?: string
  currency?: string
  vatPercent?: string
}

export function TicketPricingGrid({
  tickets,
  registrationLink,
  currency = 'NOK',
  vatPercent,
}: TicketPricingGridProps) {
  const { categories, tiers, matrix } = buildPricingMatrix(tickets)

  // Separate standalone tickets (those without a tier match in the matrix)
  const standaloneCategories = categories.filter((_cat, idx) =>
    matrix[idx].every((cell) => cell === null),
  )
  const tieredCategories = categories.filter((_cat, idx) =>
    matrix[idx].some((cell) => cell !== null),
  )
  const tieredMatrix = matrix.filter((row) => row.some((cell) => cell !== null))

  const vat = vatPercent || (tickets[0]?.price[0]?.vat ?? '25')
  const vatDisplay = parseFloat(vat) % 1 === 0 ? parseInt(vat).toString() : vat

  return (
    <div className="space-y-8">
      {/* Pricing grid for tiered tickets */}
      {tiers.length > 0 && tieredCategories.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="min-w-45 p-3" />
                {tiers.map((tier) => (
                  <th
                    key={tier.label}
                    className={clsx(
                      'min-w-40 rounded-t-xl px-4 py-4 text-center',
                      tier.status === 'active'
                        ? 'bg-brand-cloud-blue text-white'
                        : tier.status === 'expired'
                          ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                          : 'bg-brand-sky-mist text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300',
                    )}
                  >
                    <div className="font-space-grotesk text-lg font-bold">
                      {tier.label}
                    </div>
                    {tier.dateRange && (
                      <div
                        className={clsx(
                          'mt-1 text-xs font-medium',
                          tier.status === 'active'
                            ? 'text-blue-100'
                            : 'opacity-75',
                        )}
                      >
                        {tier.dateRange}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tieredCategories.map((category, catIdx) => (
                <tr
                  key={category.key}
                  className="border-b border-gray-100 dark:border-gray-700"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <TicketIcon className="h-5 w-5 text-brand-cloud-blue dark:text-blue-400" />
                      <span className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-gray-200">
                        {category.label}
                      </span>
                    </div>
                  </td>
                  {tieredMatrix[catIdx].map((ticket, tierIdx) => {
                    const tier = tiers[tierIdx]
                    const status = ticket
                      ? getTicketSaleStatus(ticket)
                      : tier.status

                    return (
                      <td
                        key={`${category.key}-${tier.label}`}
                        className={clsx(
                          'px-4 py-4 text-center',
                          status === 'active'
                            ? 'bg-brand-cloud-blue/5 dark:bg-blue-900/20'
                            : status === 'expired'
                              ? 'bg-gray-50 dark:bg-gray-800/50'
                              : 'bg-brand-sky-mist/30 dark:bg-gray-800/30',
                        )}
                      >
                        {ticket ? (
                          <PriceCell
                            ticket={ticket}
                            currency={currency}
                            status={status}
                            registrationLink={registrationLink}
                          />
                        ) : (
                          <span className="text-sm text-gray-400">&mdash;</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Standalone tickets (e.g., Student) */}
      {standaloneCategories.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standaloneCategories.map((category) => {
            const ticket = category.tickets[0]
            if (!ticket) return null
            const status = getTicketSaleStatus(ticket)

            return (
              <div
                key={category.key}
                className={clsx(
                  'rounded-xl border p-5 transition-shadow hover:shadow-md',
                  status === 'active'
                    ? 'border-brand-cloud-blue/20 bg-white dark:border-blue-800/30 dark:bg-gray-800'
                    : status === 'expired'
                      ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50'
                      : 'border-brand-sky-mist bg-brand-sky-mist/20 dark:border-gray-700 dark:bg-gray-800/30',
                )}
              >
                <div className="mb-3 flex items-center gap-2">
                  <TicketIcon
                    className={clsx(
                      'h-5 w-5',
                      status === 'active'
                        ? 'text-brand-cloud-blue dark:text-blue-400'
                        : 'text-gray-400',
                    )}
                  />
                  <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray dark:text-gray-200">
                    {ticket.name}
                  </h3>
                </div>
                <div className="mb-3">
                  <PriceCell
                    ticket={ticket}
                    currency={currency}
                    status={status}
                    registrationLink={registrationLink}
                    showLabel={false}
                  />
                </div>
                {ticket.description && (
                  <p className="font-inter text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {stripHtml(ticket.description)}
                  </p>
                )}
                {ticket.available !== null && ticket.available <= 20 && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-sunbeam-yellow">
                    <CalendarDaysIcon className="h-3.5 w-3.5" />
                    Only {ticket.available} left
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* VAT note */}
      <p className="font-inter text-center text-xs text-gray-500 dark:text-gray-400">
        All prices in {currency} excl. {vatDisplay}% VAT.
        {registrationLink && (
          <>
            {' '}
            Tickets available at{' '}
            <a
              href={registrationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-cloud-blue underline hover:text-brand-fresh-green dark:text-blue-400"
            >
              our registration page
            </a>
            .
          </>
        )}
      </p>
    </div>
  )
}

function PriceCell({
  ticket,
  currency,
  status,
  registrationLink,
  showLabel = true,
}: {
  ticket: PublicTicketType
  currency: string
  status: 'expired' | 'active' | 'upcoming'
  registrationLink?: string
  showLabel?: boolean
}) {
  const price = ticket.price[0]
  if (!price) return null

  const formatted = formatTicketPrice(price.price, price.vat)
  const formattedInclVat = formatTicketPrice(price.price, price.vat, {
    includeVat: true,
  })

  if (status === 'expired') {
    return (
      <div>
        {showLabel && (
          <div className="mb-0.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Expired
          </div>
        )}
        <div className="font-space-grotesk text-base font-bold text-gray-400 line-through dark:text-gray-500">
          {currency} {formatted}
        </div>
      </div>
    )
  }

  if (status === 'upcoming') {
    return (
      <div>
        {showLabel && (
          <div className="mb-0.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Coming soon
          </div>
        )}
        <div className="font-space-grotesk text-base font-bold text-gray-400 dark:text-gray-500">
          {currency} {formatted}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="font-space-grotesk text-xl font-bold text-brand-slate-gray dark:text-white">
        {currency} {formatted}
      </div>
      <div className="font-inter mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
        {currency} {formattedInclVat} incl. VAT
      </div>
      {registrationLink && (
        <a
          href={registrationLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-inter mt-2 inline-block rounded-lg bg-brand-cloud-blue px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 dark:hover:bg-blue-600"
        >
          Buy ticket
        </a>
      )}
    </div>
  )
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
