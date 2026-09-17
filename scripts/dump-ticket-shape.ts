#!/usr/bin/env tsx

/**
 * Ground truth about the SHAPE of the tickets a provider actually returns,
 * printed as evidence. NO WRITES.
 *
 * /admin/tickets classifies a ticket as paid or free by PRICE (`sum > 0` vs
 * `sum === 0`). That reading breaks on 100%-off sponsor codes, workshop upgrade
 * add-ons and comps issued inside an otherwise paid order — all of which can
 * land at `sum: 0` without being "a free ticket". Before that classification is
 * replaced, this dump answers three questions from live data:
 *
 *   1. does one ticket type mix free and paid rows, and where do 100%-off
 *      redemptions land?
 *   2. is `sum` a PER-TICKET amount or an ORDER TOTAL repeated on every ticket
 *      in the order? (This is the adapter's `amountBasis` declaration under
 *      test, so every row below is read with `rawAmounts: true` — normalized
 *      rows would only ever confirm whatever the adapter already declares.)
 *   3. which humans hold more than one ticket (a comp plus a paid seat, a
 *      conference ticket plus a workshop upgrade)?
 *
 * Usage:
 *   NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/dump-ticket-shape.ts
 *   DUMP_CONFERENCE_ID=<id> NODE_OPTIONS=--conditions=react-server pnpm tsx \
 *     scripts/dump-ticket-shape.ts
 *
 * Without `DUMP_CONFERENCE_ID` every conference with a usable ticketing binding
 * is dumped (this tool only reads, so unlike the backfill scripts it does not
 * need to be TOLD which tenant it is pointed at). `--conditions=react-server`
 * resolves the `server-only` marker so the ticketing barrel — which reaches the
 * per-org secrets store, and is exactly the part that must not be
 * reimplemented — can be imported outside a Server Component.
 */

// Load env BEFORE importing anything that constructs the Sanity client at module
// load time (client.ts reads process.env eagerly). Static app imports would be
// hoisted above this, so the app modules are pulled in via dynamic import below.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env') })
config({ path: resolve(process.cwd(), '.env.local'), override: true })

import type { EventTicket } from '../src/lib/tickets/types'

interface ConferenceRow {
  _id: string
  title?: string
  startDate?: string
  ticketingProvider?: 'checkin' | 'tito' | null
  checkinCustomerId?: number
  checkinEventId?: number
  titoAccountSlug?: string | null
  titoEventSlug?: string | null
  organization?: { _ref?: string } | null
}

const RULE = '='.repeat(78)

/** At most `cap` distinct values, rendered with a "+N more" tail. */
function capped(values: number[], cap = 6): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const head = sorted.slice(0, cap).join(', ')
  const rest = sorted.length - cap
  return rest > 0 ? `${head} (+${rest} more)` : head || '—'
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}

async function dumpConference(conference: ConferenceRow) {
  const { resolveTicketingProvider, ticketingBinding } =
    await import('../src/lib/tickets/provider')
  const { parseTicketAmount } = await import('../src/lib/tickets/amount')
  const { calculateDiscountUsage } = await import('../src/lib/discounts/usage')

  console.log(`\n${RULE}`)
  console.log(`${conference.title ?? '—'}  [${conference._id}]`)
  console.log(RULE)

  const ticketing = await resolveTicketingProvider(ticketingBinding(conference))
  if (!ticketing.configured) {
    console.log('  no usable ticketing binding or credentials — skipped')
    return
  }

  // RAW rows, deliberately. `fetchEventTickets` normally applies
  // `toPerTicketAmounts` using the adapter's own `amountBasis` — the very
  // declaration question 2 exists to test. A `'per-order'` feed would come back
  // evenly split, i.e. looking per-ticket, and the probe would "confirm"
  // whatever happens to be configured. So it reads what the vendor sent.
  const tickets = await ticketing.provider.fetchEventTickets(
    ticketing.eventRef,
    { rawAmounts: true },
  )
  if (tickets.length === 0) {
    // An empty read is not proof of an empty event — a rate-limited or short
    // read prints identically. Say so rather than let it read as ground truth.
    console.log(
      '  provider returned NO tickets. That is either genuinely none or a ' +
        'short/rate-limited read — re-run before concluding anything.',
    )
    return
  }

  const amount = (t: EventTicket) => parseTicketAmount(t.sum)
  const codeOf = (t: EventTicket) => t.coupon || t.discount || null

  // --- 1. per ticket type ---------------------------------------------------
  console.log('\n1. PER TICKET TYPE')
  console.log(
    '   category'.padEnd(36) +
      'n'.padStart(5) +
      'sum=0'.padStart(7) +
      'sum>0'.padStart(7) +
      'coded'.padStart(7) +
      '  distinct sums',
  )
  for (const [category, rows] of groupBy(tickets, (t) => t.category)) {
    const free = rows.filter((t) => amount(t) === 0).length
    const coded = rows.filter((t) => codeOf(t)).length
    console.log(
      `   ${category}`.padEnd(36) +
        String(rows.length).padStart(5) +
        String(free).padStart(7) +
        String(rows.length - free).padStart(7) +
        String(coded).padStart(7) +
        `  ${capped(rows.map(amount))}`,
    )
  }

  // --- 2. what `sum` means --------------------------------------------------
  const orders = groupBy(tickets, (t) => t.order_id)
  const multi = [...orders].filter(([, rows]) => rows.length > 1)

  console.log('\n2. SUM CONVENTION PROBE (multi-ticket orders)')
  let identical = 0
  let different = 0
  for (const [orderId, rows] of multi) {
    const sums = rows.map(amount)
    const allSame = sums.every((s) => s === sums[0])
    if (allSame) identical++
    else different++
    console.log(
      `   order ${String(orderId).padEnd(12)} n=${String(rows.length).padStart(3)}  ` +
        `sums=[${sums.join(', ')}]  ${allSame ? 'IDENTICAL' : 'DIFFERENT'}`,
    )
  }
  if (multi.length === 0) {
    console.log(
      '   No multi-ticket orders in this event. The probe is SILENT, not ' +
        'negative: single-ticket orders are consistent with BOTH readings and ' +
        'settle nothing.',
    )
  } else if (different > 0 && identical === 0) {
    console.log(
      `\n   VERDICT (evidence, not proof): every one of the ${different} ` +
        'multi-ticket order(s) carries DIFFERENT sums across its tickets, ' +
        'which supports `sum` being a PER-TICKET amount.',
    )
  } else if (identical > 0 && different === 0) {
    console.log(
      `\n   VERDICT (evidence, not proof): all ${identical} multi-ticket ` +
        'order(s) repeat one IDENTICAL sum on every ticket, which supports ' +
        '`sum` being an ORDER TOTAL repeated per ticket. Note that N tickets ' +
        'of the same price produce the same pattern — see the totals line.',
    )
  } else {
    console.log(
      `\n   VERDICT: MIXED — ${identical} order(s) identical, ${different} ` +
        'different. `sum` cannot be an order total under any consistent ' +
        'reading; the identical ones are same-priced tickets.',
    )
  }

  // --- 3. discount codes ----------------------------------------------------
  console.log('\n3. DISCOUNT CODE USAGE')
  const usage = calculateDiscountUsage(tickets)
  const byId = new Map(tickets.map((t) => [t.id, t]))
  const codes = Object.entries(usage)
  if (codes.length === 0) {
    console.log('   No ticket carries a coupon or discount code.')
  }
  for (const [code, stats] of codes) {
    const rows = stats.ticketIds
      .map((id) => byId.get(id))
      .filter((t): t is EventTicket => Boolean(t))
    const types = [...new Set(rows.map((t) => t.category))].join(', ')
    console.log(
      `   ${code.padEnd(24)} redemptions=${String(stats.usageCount).padStart(4)}  ` +
        `sums=[${capped(rows.map(amount))}]  totalPaid=${stats.totalPaid}`,
    )
    console.log(`   ${' '.repeat(24)} types: ${types}`)
  }

  // --- 4. email overlap -----------------------------------------------------
  console.log('\n4. EMAILS HOLDING MORE THAN ONE TICKET')
  const byEmail = groupBy(tickets, (t) =>
    (t.crm?.email ?? '').trim().toLowerCase(),
  )
  let overlaps = 0
  for (const [email, rows] of byEmail) {
    if (!email || rows.length < 2) continue
    overlaps++
    console.log(`   ${email}  (${rows.length} tickets)`)
    for (const t of rows) {
      console.log(
        `      • ${t.category.padEnd(32)} sum=${amount(t)}` +
          (codeOf(t) ? `  code=${codeOf(t)}` : ''),
      )
    }
  }
  if (overlaps === 0) console.log('   None — every address holds one ticket.')

  // --- totals ---------------------------------------------------------------
  const free = tickets.filter((t) => amount(t) === 0).length
  const perTicketTotal = tickets.reduce((sum, t) => sum + amount(t), 0)
  // The same money under the other reading: one `sum` per DISTINCT order. If
  // `sum` is an order total repeated per ticket, this is the event total; if it
  // is a per-ticket amount, the per-ticket figure is. Print both so the output
  // can be reconciled against the provider's own reported event total.
  const perOrderTotal = [...orders].reduce(
    (sum, [, rows]) => sum + amount(rows[0]),
    0,
  )
  console.log(
    `\n   TOTALS: ${tickets.length} ticket(s) in ${orders.size} order(s); ` +
      `${free} with sum=0, ${tickets.length - free} with sum>0; ` +
      `${[...byEmail.keys()].filter(Boolean).length} unique email(s); ` +
      `sum once per ticket = ${perTicketTotal}, once per order = ${perOrderTotal}.`,
  )
}

async function main() {
  const { clientReadUncached } = await import('../src/lib/sanity/client')

  const conferences = await clientReadUncached.fetch<ConferenceRow[]>(
    // groq-global: the tenant registry itself — this read RESOLVES the tenants
    // the rest of the run is scoped to, so it cannot be scoped by one.
    `*[_type == "conference" && !(_id in path("drafts.**"))]{
      _id, title, startDate, ticketingProvider, checkinCustomerId, checkinEventId,
      titoAccountSlug, titoEventSlug, organization
    } | order(startDate desc)`,
  )

  const pinned = process.env.DUMP_CONFERENCE_ID
  const selected = pinned
    ? conferences.filter((c) => c._id === pinned)
    : conferences
  if (pinned && selected.length === 0) {
    console.error(`✖ DUMP_CONFERENCE_ID=${pinned} not found. Candidates:`)
    for (const c of conferences) {
      console.error(
        `  ${c._id.padEnd(28)} startDate=${c.startDate ?? '—'}  ${c.title ?? '—'}`,
      )
    }
    process.exit(1)
  }

  for (const conference of selected) {
    await dumpConference(conference)
  }
  console.log('')
}

main().catch((error) => {
  console.error('Dump failed:', error)
  process.exit(1)
})
