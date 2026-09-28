import 'server-only'
import type {
  SanityAssetDocument,
  SanityImageAssetDocument,
} from '@sanity/client'
import { clientWrite } from '@/lib/sanity/client'

/**
 * Upload a body to Sanity's asset endpoint as an image or file asset, with
 * our own `fetch` rather than `clientWrite.assets.upload`.
 *
 * WHY NOT THE CLIENT (#1167): a Next route handler is bundled with the
 * `react-server` condition, under which `@sanity/client`'s HTTP layer
 * (`get-it`) is a `fetch` shim that passes a Node stream body straight to
 * `fetch` without `duplex: 'half'`. Node's fetch refuses that outright
 * ("RequestInit: duplex option is required when sending a body"), so every
 * streamed upload from a route handler failed in production while every test
 * — which loads the Node build — passed. Measured on 2026-09-29 with
 * `node --conditions=react-server` and a Turbopack build of this route.
 *
 * Here the body is a web stream sent with `duplex: 'half'`, so it streams
 * under any build: `fetch` pulls a chunk only when the socket can take it, and
 * a body that errors (the byte counter's cap) or the deadline aborts the
 * request half-sent.
 */
export async function uploadAssetStream(
  kind: 'image',
  body: ReadableStream<Uint8Array> | Uint8Array,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityImageAssetDocument>
export async function uploadAssetStream(
  kind: 'file',
  body: ReadableStream<Uint8Array> | Uint8Array,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityAssetDocument>
export async function uploadAssetStream(
  kind: 'image' | 'file',
  body: ReadableStream<Uint8Array> | Uint8Array,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityAssetDocument>
export async function uploadAssetStream(
  kind: 'image' | 'file',
  body: ReadableStream<Uint8Array> | Uint8Array,
  options: { filename: string; contentType: string },
  timeoutMs: number,
): Promise<SanityAssetDocument> {
  const { dataset, token } = clientWrite.config()
  const url = new URL(
    clientWrite.getUrl(
      `/assets/${kind === 'image' ? 'images' : 'files'}/${dataset}`,
    ),
  )
  url.searchParams.set('filename', options.filename)
  // The client sets NO timeout of its own. Give up well before the route's
  // `maxDuration`, so the blob delete and the answer still run.
  const deadline = new AbortController()
  const timer = setTimeout(
    () => deadline.abort(new Error('Sanity upload timed out')),
    timeoutMs,
  )
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': options.contentType,
      },
      body,
      // A streamed request body: required by `fetch` for a stream.
      duplex: 'half',
      cache: 'no-store',
      signal: deadline.signal,
    } as RequestInit & { duplex: 'half' })
    const answer = (await response.json().catch(() => null)) as {
      document?: SanityAssetDocument
    } | null
    if (!response.ok || !answer?.document)
      throw new Error(`Sanity asset upload failed: ${response.status}`)
    return answer.document
  } finally {
    clearTimeout(timer)
  }
}
