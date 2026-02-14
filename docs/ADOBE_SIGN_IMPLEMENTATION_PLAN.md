# Adobe Sign OAuth + Sponsor Portal Implementation Plan

## Overview

Rewrite Adobe Sign integration from `client_credentials` to per-user OAuth Authorization Code flow with ephemeral encrypted cookie tokens. Rename the sponsor onboarding page to **Sponsor Portal** — a stable, shareable link that serves as the sponsor's single touchpoint for setup, contract signing, and sponsorship status. Add signing URL capture, signer selection, text tags in generated PDFs, and branded signing emails. Webhook extracts signed documents inline.

## Architecture Decisions

- **Sponsor Portal replaces onboarding page.** `/sponsor/portal/[token]` — stable UUID, never expires, safe to forward. Read-only for anyone with the link; one-time setup write protected by `onboardingComplete` flag.
- **No auto-send.** Contract is NOT automatically sent after portal setup. Admin triggers manually from CRM (requires active OAuth session).
- **Signing link.** Captured via `GET /agreements/{id}/signingUrls` immediately after `createAgreement()`, stored as `signingUrl` on SFC. Displayed on portal AND sent via branded Resend email.
- **Signer selection.** Sponsors choose who signs during portal setup (dropdown when >1 contact). Stored as `signerEmail` on SFC. Admin can still override when sending manually.
- **Sponsor-only signing.** Only the sponsor signs digitally. The organizer's signature block is decorative — sending the agreement implies organizer consent.
- **Text tags in PDF.** Invisible `{{Sig_es_:signer1:signature}}` and `{{Dte_es_:signer1:date}}` markers in the sponsor signature block tell Adobe Sign where to place fields. No `formFields` API parameter needed.
- **Ephemeral tokens only.** No refresh tokens stored in DB. Cookie-based JWE encrypted with `AUTH_SECRET`. 60-day refresh token window.
- **Webhook is self-sufficient.** Signed documents extracted from webhook payload base64 (`includeSignedDocuments: true`). No API calls needed in webhook handler.
- **Cron uses Resend.** Contract reminders sent via own email system, not Adobe Sign API.
- **Portal shows package details.** Tier name, signer email, and contract status visible to sponsor. Foundation for future additions (discount codes, etc.).

---

## Phase 1: OAuth Infrastructure

Blocks all other phases except Phase 3 (Sponsor Portal) and Phase 4 (PDF Text Tags).

**Step 1.** Create `src/lib/adobe-sign/auth.ts`:

- `getAuthorizeUrl(state)` → `https://secure.eu2.adobesign.com/public/oauth/v2` with scopes `agreement_read agreement_write agreement_send webhook_read webhook_write`
- `exchangeCodeForTokens(code)` → POST `https://api.eu2.adobesign.com/oauth/v2/token` with `grant_type=authorization_code`
- `refreshAccessToken(refreshToken)` → POST `/oauth/v2/refresh`
- `encryptSession()` / `decryptSession()` — JWE via `jose`, keyed on `AUTH_SECRET`
- `getAdobeSignSession()` / `setAdobeSignSession()` / `clearAdobeSignSession()` — HTTP-only, Secure, SameSite=Lax cookie helpers
- Env vars: `ADOBE_SIGN_CLIENT_ID`, `ADOBE_SIGN_CLIENT_SECRET`, `ADOBE_SIGN_SHARD` (default `eu2`)

**Step 2.** Create `src/app/api/adobe-sign/authorize/route.ts`:

- GET handler, admin-only (check auth session for `isOrganizer`)
- Generate random `state`, store in short-lived cookie
- Redirect to Adobe Sign authorization URL

**Step 3.** Create `src/app/api/adobe-sign/callback/route.ts`:

- GET handler, validate `state` cookie
- Exchange `code` for tokens
- Extract `api_access_point` from response
- Encrypt `{ accessToken, refreshToken, apiAccessPoint, expiresAt }` into JWE cookie
- Redirect to `/admin/sponsors/contracts`

---

## Phase 2: Client & Types Rewrite

Depends on Phase 1.

**Step 4.** Rewrite `src/lib/adobe-sign/types.ts`:

- Remove `AdobeSignConfig`, `AccessToken`
- Add `AdobeSignSession { accessToken, refreshToken, apiAccessPoint, expiresAt }`
- Add `SigningUrlResponse`, `WebhookDocumentInfo` types

**Step 5.** Rewrite `src/lib/adobe-sign/client.ts`:

- Remove `getAccessToken()` and all `client_credentials` logic
- Every function gains `(session: AdobeSignSession, ...)` parameter
- Add `getSigningUrls(session, agreementId)` → `GET /agreements/{id}/signingUrls`
- Keep: `uploadTransientDocument`, `createAgreement`, `getAgreement`, `sendReminder`, `cancelAgreement`
- Remove `downloadSignedDocument` (webhook handles it inline)

**Step 6.** Update `src/lib/adobe-sign/index.ts`:

- Export new types, remove old ones
- Remove `downloadSignedDocument`, `clearTokenCache`, `testConnection` exports

---

## Phase 3: Sponsor Portal

Independent of OAuth phases. Can be implemented in parallel with Phase 1.

**Step 7.** Rename route and component:

- Move `src/app/(main)/sponsor/onboarding/[token]/page.tsx` → `src/app/(main)/sponsor/portal/[token]/page.tsx`
- Create redirect at old path: `src/app/(main)/sponsor/onboarding/[token]/page.tsx` → permanent redirect to `/sponsor/portal/[token]`
- Rename `src/components/sponsor/SponsorOnboardingForm.tsx` → `src/components/sponsor/SponsorPortal.tsx`
- Rename `src/components/sponsor/SponsorOnboardingForm.stories.tsx` → `src/components/sponsor/SponsorPortal.stories.tsx`
- Update story title from `Systems/Sponsors/Onboarding/SponsorOnboardingForm` → `Systems/Sponsors/Portal/SponsorPortal`
- Update `SponsorOnboardingLogoUpload` story description references
- Update `.storybook/preview.tsx` component list reference
- Update `src/docs/SponsorSystem.stories.tsx` and `src/docs/SponsorComponentIndex.stories.tsx` references

**Step 8.** Update `src/lib/sponsor-crm/onboarding.ts`:

- Rename `buildOnboardingUrl()` → `buildPortalUrl()`, change path to `/sponsor/portal/`
- Expand `OnboardingSponsorInfo` to include: `signingUrl?`, `signatureStatus?`, `contractStatus?`, `signerEmail?`, `tierTitle?` (already has this), `contractValue?`, `contractCurrency?`
- Update `validateOnboardingToken` GROQ to fetch the new fields
- In `completeOnboarding()`: write `signerEmail` to SFC document during transaction

**Step 9.** Add signer selection to portal setup form (`SponsorPortal.tsx`):

- After Contact Persons section, add "Contract Signer" section (visible when >1 contact with email)
- Dropdown: "Who should sign the sponsorship agreement?" listing contact names + emails
- Default: primary contact's email
- Submit selected email as `signerEmail` in mutation payload

**Step 10.** Update `src/server/schemas/onboarding.ts`:

- Add `signerEmail: z.string().email().optional()` to `OnboardingSubmissionSchema`

**Step 11.** Update `src/server/routers/onboarding.ts`:

- **Remove** auto-send: delete `generateAndSendContract()` call from `complete` mutation
- Instead, set `contractStatus: 'ready'` on the SFC to signal admin that setup is complete
- Rename `generateToken` to `generatePortalToken` (keep backward compat if needed)
- Update `buildOnboardingUrl` → `buildPortalUrl` import

**Step 12.** Implement portal status dashboard in `SponsorPortal.tsx`:

- After setup is complete (revisit with `onboardingComplete: true`), replace static success message with progressive status view:

| Portal State                | What shows                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Setup done, no contract yet | "Setup complete" + read-only summary of submitted info + "Your contract will be sent shortly" |
| Contract pending signature  | Sponsorship summary + signer email + prominent "Sign Contract" button → `signingUrl`          |
| Contract signed             | "Contract signed — thank you" confirmation                                                    |

- Always show: sponsor name, conference name, tier, package details when available
- Foundation layout supports future additions (discount codes, logistics info, etc.)

**Step 13.** Update admin references:

- `src/components/admin/sponsor-crm/SponsorContractView.tsx`: update `SponsorPortalSection` to use `buildPortalUrl()` and `/sponsor/portal/` path
- `src/lib/sponsor-crm/action-items.ts`: update any `onboardingToken` references
- `src/docs/SPONSOR_SYSTEM.md`: update route references
- `__tests__/lib/sponsor-crm/onboarding.test.ts`: update `buildOnboardingUrl` → `buildPortalUrl` tests, expected URLs

---

## Phase 4: PDF Text Tags

Independent. Can be implemented in parallel with any phase.

**Step 14.** Update `src/lib/sponsor-crm/contract-pdf.tsx`:

- In the sponsor (right-side) signature block, add invisible text tags:
  ```tsx
  <Text style={{ fontSize: 1, color: '#ffffff' }}>
    {'{{Sig_es_:signer1:signature}}'}
  </Text>
  ```
  and:
  ```tsx
  <Text style={{ fontSize: 1, color: '#ffffff' }}>
    {'{{Dte_es_:signer1:date}}'}
  </Text>
  ```
- Left-side (organizer) block stays purely visual — no text tags
- `createAgreement` call stays the same — single participant with role `SIGNER` maps to `signer1`

---

## Phase 5: Webhook Update

Can proceed once Phase 2 types are defined. Independent of OAuth cookie flow.

**Step 15.** Update `src/app/api/webhooks/adobe-sign/route.ts`:

- On `AGREEMENT_WORKFLOW_COMPLETED`: extract signed PDF from `event.agreement.signedDocumentInfo` base64 payload
- Upload buffer to Sanity via `clientWrite.assets.upload()`
- Remove `downloadSignedDocument()` API call
- Handle `conditionalParametersTrimmed` gracefully — log warning if document not inline
- Set `signatureStatus: 'signed'`, `contractSignedAt`, attach signed document to SFC

---

## Phase 6: tRPC & Admin UI Updates

Depends on Phases 1–2.

**Step 16.** Update `src/server/routers/sponsor.ts`:

- Add `getAdobeSignStatus` query — reads cookie, returns `{ connected, expiresAt?, apiAccessPoint? }`
- Add `getAdobeSignAuthorizeUrl` query — returns OAuth URL
- Add `disconnectAdobeSign` mutation — clears cookie
- Add `registerWebhook` mutation — creates webhook via API using session token
- Modify `sendContract` — read token from cookie, pass to client functions; after `createAgreement()`, call `getSigningUrls()` and store `signingUrl` on SFC
- Remove `testAdobeSignConnection` (replaced by OAuth connect)
- Remove or simplify `checkSignatureStatus` (webhook-only)

**Step 17.** Send branded signing email:

- After contract is sent and `signingUrl` is captured, send Resend email to signer
- Include: signing link, conference branding, sponsor name, package details
- Reuse `renderEmailTemplate()` pattern from `src/lib/email/route-helpers.ts`
- Supplementary to Adobe Sign's native notification

**Step 18.** Rewrite `src/components/admin/sponsor/AdobeSignConfigPanel.tsx`:

- Show OAuth connection status (connected/disconnected, token expiry)
- "Connect to Adobe Sign" / "Disconnect" buttons
- "Register Webhook" button
- Remove env var status display and test connection button

**Step 19.** Update `src/lib/sponsor-crm/contract-send.ts`:

- `generateAndSendContract()` gains `session: AdobeSignSession` parameter
- Pass `session` to `uploadTransientDocument()`, `createAgreement()`
- After `createAgreement()`, call `getSigningUrls(session, agreementId)` and return URL
- Store `signingUrl` on SFC alongside `signatureId`

---

## Phase 7: Schema, Cron & Cleanup

Depends on Phase 6.

**Step 20.** Add `signingUrl` field to `sponsorForConference`:

- `sanity/schemaTypes/sponsorForConference.ts` — string, readOnly
- `src/lib/sponsor-crm/types.ts` — add to `SponsorForConference`, `SponsorForConferenceExpanded`, `SponsorForConferenceInput`
- `src/lib/sponsor-crm/sanity.ts` — add to GROQ projections
- `src/server/schemas/sponsorForConference.ts` — add to zod schemas

**Step 21.** Update `src/app/api/cron/contract-reminders/route.ts`:

- Remove Adobe Sign `sendReminder()` API call
- Query Sanity for SFCs with `signatureStatus: 'pending'` and `contractSentAt` older than threshold
- Send reminder emails via Resend
- Sanity as sole source of truth

**Step 22.** Cleanup:

- Remove `ADOBE_SIGN_BASE_URL` env var references
- Add `ADOBE_SIGN_SHARD` to env config / `.env.example`
- Remove `downloadSignedDocument` from client and index exports
- Remove `clearTokenCache`, `testConnection` from client
- Update all tests affected by renames and API changes

---

## File Inventory

### New files

| File                                               | Purpose                              |
| -------------------------------------------------- | ------------------------------------ |
| `src/lib/adobe-sign/auth.ts`                       | OAuth helpers, JWE cookie encryption |
| `src/app/api/adobe-sign/authorize/route.ts`        | OAuth redirect endpoint              |
| `src/app/api/adobe-sign/callback/route.ts`         | OAuth callback endpoint              |
| `src/app/(main)/sponsor/portal/[token]/page.tsx`   | Sponsor Portal page (new route)      |
| `src/components/sponsor/SponsorPortal.tsx`         | Sponsor Portal component (renamed)   |
| `src/components/sponsor/SponsorPortal.stories.tsx` | Sponsor Portal stories (renamed)     |

### Modified files

| File                                                       | Changes                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/adobe-sign/client.ts`                             | Remove `client_credentials`, accept `AdobeSignSession` param, add `getSigningUrls()` |
| `src/lib/adobe-sign/types.ts`                              | Replace `AdobeSignConfig`/`AccessToken` with `AdobeSignSession`, add new types       |
| `src/lib/adobe-sign/index.ts`                              | Update exports                                                                       |
| `src/lib/sponsor-crm/onboarding.ts`                        | Rename `buildOnboardingUrl` → `buildPortalUrl`, expand GROQ, write `signerEmail`     |
| `src/lib/sponsor-crm/contract-send.ts`                     | Accept `AdobeSignSession` param, capture `signingUrl`                                |
| `src/lib/sponsor-crm/contract-pdf.tsx`                     | Add text tags to sponsor signature block                                             |
| `src/lib/sponsor-crm/types.ts`                             | Add `signingUrl` to SFC types                                                        |
| `src/lib/sponsor-crm/sanity.ts`                            | Add `signingUrl` to GROQ projections                                                 |
| `src/server/routers/onboarding.ts`                         | Remove auto-send, set `contractStatus: 'ready'`, use `buildPortalUrl`                |
| `src/server/routers/sponsor.ts`                            | Add OAuth endpoints, signing URL capture, remove old test/check methods              |
| `src/server/schemas/onboarding.ts`                         | Add `signerEmail` to submission schema                                               |
| `src/server/schemas/sponsorForConference.ts`               | Add `signingUrl` to zod schemas                                                      |
| `src/app/api/webhooks/adobe-sign/route.ts`                 | Extract inline signed doc, remove API download                                       |
| `src/app/api/cron/contract-reminders/route.ts`             | Switch to Resend emails                                                              |
| `src/components/admin/sponsor/AdobeSignConfigPanel.tsx`    | OAuth connect/disconnect UI                                                          |
| `src/components/admin/sponsor-crm/SponsorContractView.tsx` | Update portal URL generation                                                         |
| `sanity/schemaTypes/sponsorForConference.ts`               | Add `signingUrl` field                                                               |
| `.storybook/preview.tsx`                                   | Update component name reference                                                      |
| `src/docs/SponsorSystem.stories.tsx`                       | Update route and component references                                                |
| `src/docs/SponsorComponentIndex.stories.tsx`               | Update component reference                                                           |

### Redirect / backward compat

| File                                                 | Purpose                                        |
| ---------------------------------------------------- | ---------------------------------------------- |
| `src/app/(main)/sponsor/onboarding/[token]/page.tsx` | Permanent redirect → `/sponsor/portal/[token]` |

### Tests to update

| File                                                                                      | Changes                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `__tests__/lib/sponsor-crm/onboarding.test.ts`                                            | Rename `buildOnboardingUrl` → `buildPortalUrl`, update expected URLs |
| New/updated tests for OAuth auth helpers, portal component, webhook inline doc extraction |

---

## Verification

- `pnpm run check` (typecheck + lint + format)
- `pnpm run test` — all tests pass
- Manual: OAuth flow — connect from `/admin/sponsors/contracts`, verify cookie set
- Manual: Send contract — verify signing URL stored, text tags placed correctly in PDF
- Manual: Complete portal setup as sponsor — verify signer selection, `signerEmail` written to SFC
- Manual: Revisit portal after contract sent — verify signing link + package details displayed
- Manual: Sign document → webhook fires → verify signed PDF extracted from payload, stored in Sanity
- Manual: Cron reminder — verify Resend email sent (not Adobe Sign API)
- Manual: Visit old `/sponsor/onboarding/[token]` URL — verify redirect to `/sponsor/portal/[token]`
- Verify Adobe Sign app has redirect URI `https://{domain}/api/adobe-sign/callback` configured

---

## Implementation Order

Phases 1, 3, and 4 are independent and can proceed in parallel. Recommended sequence:

1. **Phase 3** (Sponsor Portal rename + signer selection + status dashboard) — no external dependencies, immediate user-facing value
2. **Phase 4** (PDF text tags) — trivial, one file change
3. **Phase 1** (OAuth infrastructure) — blocks Phases 2, 5, 6
4. **Phase 2** (Client rewrite) — blocks Phase 6
5. **Phase 5** (Webhook update) — can overlap with Phase 6
6. **Phase 6** (tRPC + admin UI)
7. **Phase 7** (Schema, cron, cleanup)
