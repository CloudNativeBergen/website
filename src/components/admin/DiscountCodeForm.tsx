'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { ArrowPathIcon, PlusIcon } from '@heroicons/react/24/outline'
import { Input, ErrorText, HelpText } from '@/components/Form'
import { FilterDropdown, FilterOption } from './FilterDropdown'
import type { TicketType } from '@/lib/discounts/types'

export interface DiscountCodeDraft {
  discountCode: string
  numberOfTickets: number
  discountPercentage: number
  selectedTicketTypes: string[]
}

/**
 * The create form for a STANDALONE discount code — one not issued to a sponsor.
 *
 * There is no name or label field, and that is deliberate rather than an
 * omission: the ticketing provider stores nothing about a discount except the
 * redeemable string, its rate, its scope and its limit. A label typed here
 * would survive until the next refetch and then vanish, so the CODE ITSELF is
 * what identifies a standalone code — `COMMUNITY2026`, `PARTNER-NDC`. The
 * placeholder says so.
 *
 * Sponsor codes take the same shape through the same mutation; they simply get
 * their code generated from the sponsor name and their limit from the tier
 * entitlement, so they need no form.
 */
export function DiscountCodeForm({
  ticketTypes,
  busy,
  onCancel,
  onCreate,
}: {
  ticketTypes: TicketType[]
  busy: boolean
  onCancel: () => void
  onCreate: (draft: DiscountCodeDraft) => void
}) {
  const [code, setCode] = useState('')
  const [percentage, setPercentage] = useState('20')
  const [limit, setLimit] = useState('1')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const scopeLabel =
    selected.length === 0
      ? 'All ticket types'
      : selected.length === 1
        ? (ticketTypes.find((t) => String(t.id) === selected[0])?.name ??
          'Unknown')
        : `${selected.length} selected`

  const submit = () => {
    const trimmed = code.trim().toUpperCase()
    const rate = Number(percentage)
    const tickets = Number(limit)

    // Validated here AND in `CreateDiscountCodeSchema`: this form is a
    // convenience, the schema is the boundary.
    if (!trimmed) return setError('Enter a code.')
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(trimmed))
      return setError('Use letters, digits and hyphens only.')
    if (!Number.isInteger(rate) || rate < 1 || rate > 100)
      return setError('Discount must be a whole number between 1 and 100.')
    if (!Number.isInteger(tickets) || tickets < 1)
      return setError('Usage limit must be at least 1.')

    setError(null)
    onCreate({
      discountCode: trimmed,
      numberOfTickets: tickets,
      discountPercentage: rate,
      selectedTicketTypes: selected,
    })
  }

  return (
    <form
      // `noValidate`: the browser's own bubble is not announced, disappears on
      // the next click, and would pre-empt the messages below — which say what
      // is actually wrong with a CODE rather than "please fill in this field".
      noValidate
      className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Input
            name="discount-code"
            label="Code"
            value={code}
            setValue={(v) => setCode(v.toUpperCase())}
            placeholder="COMMUNITY2026"
            required
          />
          <HelpText>
            What attendees type at checkout, and the only thing that identifies
            this code afterwards.
          </HelpText>
        </div>
        <div>
          <Input
            name="discount-percentage"
            label="Discount (%)"
            type="number"
            value={percentage}
            setValue={setPercentage}
          />
          <HelpText>1–100. Use 100 for a free ticket.</HelpText>
        </div>
        <div>
          <Input
            name="discount-limit"
            label="Usage limit"
            type="number"
            value={limit}
            setValue={setLimit}
          />
          <HelpText>How many tickets this code may be redeemed for.</HelpText>
        </div>
      </div>

      <div>
        <span className="block text-sm/6 font-medium text-gray-900 dark:text-white">
          Eligible ticket types
        </span>
        {/* Full width, because it is a control: at a fixed width it is clipped
            in a phone-sized card, the same failure the sponsor row had. */}
        <div className="mt-2">
          <FilterDropdown
            label={scopeLabel}
            activeCount={selected.length}
            width="wider"
            position="left"
          >
            {ticketTypes.map((t) => (
              <FilterOption
                key={t.id}
                onClick={() => toggle(String(t.id))}
                checked={selected.includes(String(t.id))}
                type="checkbox"
                keepOpen={true}
              >
                {t.name}
              </FilterOption>
            ))}
          </FilterDropdown>
        </div>
        <HelpText>
          Leave empty to let the code apply to every ticket type.
        </HelpText>
      </div>

      {/* Announced, not merely red: `ErrorText` is a plain paragraph, and with
          `noValidate` this message is the only thing that reports the refusal. */}
      <div role="alert" aria-live="polite">
        {error && <ErrorText>{error}</ErrorText>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={clsx(BUTTON_BASE, BUTTON_SECONDARY)}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className={clsx(BUTTON_BASE, BUTTON_PRIMARY)}
        >
          {busy ? (
            <ArrowPathIcon
              className="h-5 w-5 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <PlusIcon className="h-5 w-5" aria-hidden="true" />
          )}
          Create code
        </button>
      </div>
    </form>
  )
}

/**
 * 44px, full width on a phone, auto from `sm` up — the same touch contract the
 * card actions in `DiscountCodeManager` follow.
 *
 * SHAPE ONLY, NO COLOUR. The variants below each carry a complete palette
 * instead of overriding this one's. Layering `bg-indigo-600 text-white` on top
 * of a base that already says `bg-white text-gray-700` does not work: they are
 * same-specificity Tailwind utilities, so the winner is decided by their order
 * in the generated stylesheet, not by the order in the `class` attribute — and
 * here it resolved to white text on a white background, an invisible button
 * that every test still passed because it was present, named and 44px tall.
 */
const BUTTON_BASE =
  'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto'

const BUTTON_SECONDARY =
  'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus-visible:outline-gray-400'

const BUTTON_PRIMARY =
  'border-indigo-600 bg-indigo-600 text-white hover:border-indigo-500 hover:bg-indigo-500 focus-visible:outline-indigo-600 dark:border-indigo-500 dark:bg-indigo-500 dark:text-white dark:hover:border-indigo-400 dark:hover:bg-indigo-400 dark:focus-visible:outline-indigo-400'
