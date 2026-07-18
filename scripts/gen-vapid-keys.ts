#!/usr/bin/env tsx

/**
 * Generate a VAPID key pair for web push notifications (issue #444).
 *
 * Web push requires an application server (VAPID) key pair. The PUBLIC key is
 * shipped to the browser to create subscriptions; the PRIVATE key is a SECRET
 * used server-side to sign push messages and MUST NEVER be committed or exposed
 * to the client.
 *
 * Usage:
 *   pnpm tsx scripts/gen-vapid-keys.ts
 *
 * Then set these in your production secret store (and `.env.local` for dev):
 *   VAPID_PUBLIC_KEY=<publicKey>
 *   VAPID_PRIVATE_KEY=<privateKey>
 *   VAPID_SUBJECT=mailto:hei@cloudnativedays.no
 *
 * Equivalent one-liner without this script:
 *   npx web-push generate-vapid-keys
 */

import webpush from 'web-push'

const { publicKey, privateKey } = webpush.generateVAPIDKeys()

console.log('VAPID key pair generated. Add these to your environment:\n')
console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${privateKey}`)
console.log('VAPID_SUBJECT=mailto:hei@cloudnativedays.no')
console.log(
  '\n⚠️  Keep VAPID_PRIVATE_KEY secret — never commit it or expose it to the client.',
)
