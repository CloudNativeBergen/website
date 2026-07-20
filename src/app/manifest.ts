import type { MetadataRoute } from 'next'

/**
 * Web app manifest (Next.js metadata route → `/manifest.webmanifest`).
 *
 * Next injects `<link rel="manifest">` automatically. The name/id are kept
 * stable across tenants so the installed app identity never changes, while the
 * icons resolve per host via the dynamic `/pwa/icon/*` routes (each conference's
 * own `logomarkBright`, with a static fallback).
 *
 * `start_url` points at `/launch` (see `src/app/launch/route.ts`): a UI-less
 * Route Handler that resolves the signed-in role server-side and 307-redirects
 * to the right home (organizer → `/admin`, speaker → `/cfp/list`, logged-out
 * attendee → the public `/program`). `id` stays `/` so the installed app
 * identity is unchanged by this start_url move.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Cloud Native Days',
    short_name: 'CND',
    description:
      'Community-driven Kubernetes and Cloud Native conferences in the Nordics.',
    start_url: '/launch',
    scope: '/',
    display: 'standalone',
    theme_color: '#1d4ed8',
    background_color: '#0b1220',
    icons: [
      {
        src: '/pwa/icon/192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa/icon/192-maskable',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/pwa/icon/512-maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
