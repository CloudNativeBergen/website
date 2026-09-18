/**
 * The historical speaker-ticket category — the literal used by
 * `@/lib/workshop/eligibility` and the ticket-sold webhook. Kept as a FALLBACK
 * alongside the derived name, so a tenant that renamed its type mid-event still
 * has its earlier claims counted. It is never the only thing matched.
 *
 * It lives in a LEAF module, with no imports, on purpose. It used to sit in
 * `./speakerStatus`, which reaches the provider barrel and through it the
 * per-org secrets store and `use cache`. `./classification` needs nothing from
 * that module but this one string, and `./participants` and `./freeAllocation`
 * export values a Client Component calls — so importing the constant from
 * there pulled server-only code into the browser bundle and failed the
 * production build, while every unit test passed. Keep this file importing
 * nothing.
 */
export const SPEAKER_TICKET_CATEGORY = 'Speaker ticket'
