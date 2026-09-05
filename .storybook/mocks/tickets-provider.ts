/**
 * Browser-safe Storybook stand-in for the ticketing provider barrel
 * `@/lib/tickets/provider` (aliased in main.ts).
 *
 * That barrel is a SERVER module: both provider clients import `node:crypto`
 * for webhook signature verification, and the credential resolver reaches
 * `server-only`. Vite externalises `node:crypto` into a Proxy that throws on
 * ANY property access, so a story whose module graph reaches the barrel dies at
 * module evaluation and renders a Vite error overlay instead of a component.
 * That is every `TicketPricingGrid` story, because the display-only
 * `@/lib/tickets/public` — where the grid gets its pure formatting helpers —
 * imports the barrel at module scope for `resolveTicketingProvider` (#954).
 *
 * THIS IS A WORKAROUND, NOT THE FIX. The real fix is #964: a display-only
 * module should not drag a provider client into every browser bundle that wants
 * its formatting helpers. When that lands, delete this file and its alias.
 *
 * No story should CALL any of this — components under story take
 * already-fetched ticket data as props — so every value throws instead of
 * returning a plausible fake that would hide a real regression. The `satisfies`
 * check pins the stub's export surface to the real barrel at compile time, so a
 * change there breaks the typecheck here instead of silently drifting.
 *
 * That guard only bites because `tsconfig.json` names `.storybook` explicitly:
 * TypeScript's `**` does not descend into dot-directories, so for a while this
 * file — and `cfp-link-actions.ts`, which makes the same promise — were never
 * type-checked at all and the promise was empty.
 */
import type * as Provider from '../../src/lib/tickets/provider'

// Relative, not `@/lib/tickets/provider/types`: types.ts is browser-safe (no
// crypto, no server-only), and this id is not the one main.ts aliases.
// Imported and then re-exported, not `export … from`: the parity guard below
// needs a LOCAL binding, and a bare re-export is not one.
import { ProviderUnsupportedError } from '../../src/lib/tickets/provider/types'
export { ProviderUnsupportedError }

export type {
  TicketingProvider,
  TicketingProviderCredentials,
  EventRef,
  CheckinEventRef,
  TitoEventRef,
  PublicEventInfo,
  PublicTicketType,
  TicketPrice,
  WebhookVerifyResult,
  CheckinWebhookPayload,
  CheckinOrderCreatedData,
  CheckinWebhookUser,
} from '../../src/lib/tickets/provider/types'

export type {
  TicketingProviderType,
  ConferenceTicketingBinding,
  ResolvedTicketing,
} from '../../src/lib/tickets/provider'

function serverOnly(name: string): never {
  throw new Error(
    `${name}() is a server-side ticketing call and is stubbed out in Storybook (see .storybook/mocks/tickets-provider.ts, #954). Stories must take ticket data as props.`,
  )
}

export const getTicketingProvider: typeof Provider.getTicketingProvider = () =>
  serverOnly('getTicketingProvider')
export const platformCheckinCredentials: typeof Provider.platformCheckinCredentials =
  () => serverOnly('platformCheckinCredentials')
export const platformTitoCredentials: typeof Provider.platformTitoCredentials =
  () => serverOnly('platformTitoCredentials')
export const resolveTicketingCredentials: typeof Provider.resolveTicketingCredentials =
  () => serverOnly('resolveTicketingCredentials')
export const resolveTicketingProvider: typeof Provider.resolveTicketingProvider =
  () => serverOnly('resolveTicketingProvider')
export const conferenceProviderType: typeof Provider.conferenceProviderType =
  () => serverOnly('conferenceProviderType')
export const ticketingBinding: typeof Provider.ticketingBinding = () =>
  serverOnly('ticketingBinding')
export const hasTicketingBinding: typeof Provider.hasTicketingBinding = () =>
  serverOnly('hasTicketingBinding')
export const parseCheckinOrderCreated: typeof Provider.parseCheckinOrderCreated =
  () => serverOnly('parseCheckinOrderCreated')

// Compile-time parity guard against the real barrel.
const _parity = {
  getTicketingProvider,
  platformCheckinCredentials,
  platformTitoCredentials,
  resolveTicketingCredentials,
  resolveTicketingProvider,
  conferenceProviderType,
  ticketingBinding,
  hasTicketingBinding,
  parseCheckinOrderCreated,
  ProviderUnsupportedError,
} satisfies typeof import('@/lib/tickets/provider')
void _parity
