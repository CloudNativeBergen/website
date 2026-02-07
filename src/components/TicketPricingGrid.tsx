import {
  buildPricingMatrix,
  formatTicketPrice,
  getTicketSaleStatus,
  stripHtml,
  type PublicTicketType,
  type ComplimentaryTicketInfo,
} from '@/lib/tickets/public'
import { TicketIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'

interface TicketPricingGridProps {
  tickets: PublicTicketType[]
  registrationLink?: string
  currency?: string
  vatPercent?: string
  complimentaryTickets?: ComplimentaryTicketInfo[]
}

export function TicketPricingGrid({
  tickets,
  registrationLink,
  currency = 'NOK',
  vatPercent,
  complimentaryTickets = [],
}: TicketPricingGridProps) {
  const { categories, tiers, matrix } = buildPricingMatrix(tickets)

  // Pair categories with their matrix rows before filtering to keep
  // indices aligned (addresses review concern about independent filtering)
  const paired = categories.map((cat, idx) => ({
    category: cat,
    row: matrix[idx],
  }))
  const tieredPairs = paired.filter((p) => p.row.some((cell) => cell !== null))
  const standalonePairs = paired.filter((p) =>
    p.row.every((cell) => cell === null),
  )

  const tieredCategories = tieredPairs.map((p) => p.category)
  const tieredMatrix = tieredPairs.map((p) => p.row)
  const standaloneCategories = standalonePairs.map((p) => p.category)

  const vat = vatPercent || (tickets[0]?.price[0]?.vat ?? '25')
  const vatDisplay = parseFloat(vat) % 1 === 0 ? parseInt(vat).toString() : vat

  const hasInclVatPrimary = standaloneCategories.some((cat) =>
    /student/i.test(cat.tickets[0]?.name ?? ''),
  )

  return (
    <div className="space-y-8">
      {/* Mobile stacked pricing (visible on small screens only) */}
      {tiers.length > 0 && tieredCategories.length > 0 && (
        <div className="space-y-6 md:hidden">
          {tieredCategories.map((category, catIdx) => (
            <div key={category.key}>
              <h3 className="font-space-grotesk mb-2 text-xl font-bold text-brand-slate-gray dark:text-white">
                {category.label}
              </h3>
              <div className="space-y-0">
                {tiers.map((tier, tierIdx) => {
                  const ticket = tieredMatrix[catIdx][tierIdx]
                  const status = ticket
                    ? getTicketSaleStatus(ticket)
                    : tier.status

                  return (
                    <div
                      key={`${category.key}-${tier.label}`}
                      className={clsx(
                        'flex items-center justify-between px-4 py-3',
                        tierIdx === 0 && 'rounded-t-xl',
                        tierIdx === tiers.length - 1 && 'rounded-b-xl',
                        status === 'active'
                          ? 'bg-brand-cloud-blue text-white'
                          : status === 'expired'
                            ? 'bg-brand-cloud-blue/60 text-white/90'
                            : 'bg-brand-sky-mist text-brand-slate-gray dark:bg-gray-700 dark:text-gray-300',
                      )}
                    >
                      <div>
                        <div className="font-space-grotesk text-sm font-bold">
                          {tier.label}
                        </div>
                        {tier.dateRange && (
                          <div className="text-xs opacity-80">
                            {tier.dateRange}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {ticket ? (
                          <MobilePriceCell
                            ticket={ticket}
                            currency={currency}
                            status={status}
                          />
                        ) : (
                          <span className="text-sm opacity-50">&mdash;</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pricing grid for tiered tickets (desktop) */}
      {tiers.length > 0 && tieredCategories.length > 0 && (
        <div className="hidden overflow-x-auto md:block">
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
      {(standaloneCategories.length > 0 || complimentaryTickets.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {standaloneCategories.map((category) => {
            const ticket = category.tickets[0]
            if (!ticket) return null
            const status = getTicketSaleStatus(ticket)

            return (
              <div
                key={category.key}
                className={clsx(
                  'flex flex-col rounded-xl border p-5 transition-shadow hover:shadow-md',
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
                    showInclVat={/student/i.test(ticket.name)}
                  />
                </div>
                {ticket.description && (
                  <p className="font-inter flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
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
          {complimentaryTickets.map((comp) => (
            <div
              key={comp.name}
              className="flex flex-col rounded-xl border border-brand-fresh-green/20 bg-white p-5 transition-shadow hover:shadow-md dark:border-green-800/30 dark:bg-gray-800"
            >
              <div className="mb-3 flex items-center gap-2">
                <TicketIcon className="h-5 w-5 text-brand-fresh-green dark:text-green-400" />
                <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray dark:text-gray-200">
                  {comp.name}
                </h3>
              </div>
              <div className="mb-3">
                <div className="font-space-grotesk text-xl font-bold text-brand-fresh-green dark:text-green-400">
                  Free
                </div>
              </div>
              <p className="font-inter flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {comp.description}
              </p>
              {comp.link && (
                <a
                  href={comp.link}
                  className="font-inter mt-3 inline-block self-start rounded-lg bg-brand-fresh-green px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 dark:hover:bg-green-600"
                >
                  Learn more
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* VAT note */}
      <p className="font-inter text-center text-xs text-gray-500 dark:text-gray-400">
        All prices in {currency} excl. {vatDisplay}% VAT
        {hasInclVatPrimary && ' unless otherwise noted'}.
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

function MobilePriceCell({
  ticket,
  currency,
  status,
}: {
  ticket: PublicTicketType
  currency: string
  status: 'expired' | 'active' | 'upcoming'
}) {
  const price = ticket.price[0]
  if (!price) return null

  const formatted = formatTicketPrice(price.price, price.vat)

  if (status === 'expired') {
    return (
      <div>
        <div className="font-space-grotesk text-lg font-bold line-through opacity-70">
          {currency} {formatted}
        </div>
        <div className="text-xs font-medium opacity-70">Expired</div>
      </div>
    )
  }

  return (
    <div className="font-space-grotesk text-lg font-bold">
      {currency} {formatted}
    </div>
  )
}

function PriceCell({
  ticket,
  currency,
  status,
  registrationLink,
  showLabel = true,
  showInclVat = false,
}: {
  ticket: PublicTicketType
  currency: string
  status: 'expired' | 'active' | 'upcoming'
  registrationLink?: string
  showLabel?: boolean
  showInclVat?: boolean
}) {
  const price = ticket.price[0]
  if (!price) return null

  const formatted = formatTicketPrice(price.price, price.vat)
  const formattedInclVat = formatTicketPrice(price.price, price.vat, {
    includeVat: true,
  })

  const primaryPrice = showInclVat ? formattedInclVat : formatted
  const secondaryPrice = showInclVat ? formatted : formattedInclVat
  const secondaryLabel = showInclVat ? 'excl. VAT' : 'incl. VAT'

  if (status === 'expired') {
    return (
      <div>
        {showLabel && (
          <div className="mb-0.5 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
            Expired
          </div>
        )}
        <div className="font-space-grotesk text-base font-bold text-gray-400 line-through dark:text-gray-500">
          {currency} {primaryPrice}
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
          {currency} {primaryPrice}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="font-space-grotesk text-xl font-bold text-brand-slate-gray dark:text-white">
        {currency} {primaryPrice}
      </div>
      <div className="font-inter mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
        {currency} {secondaryPrice} {secondaryLabel}
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
