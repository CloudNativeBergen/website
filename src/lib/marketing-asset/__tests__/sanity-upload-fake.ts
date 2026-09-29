/**
 * A stand-in for `uploadAssetStream` (`../sanity-upload`) that behaves as the
 * real one is measured to in `move.real-client.test.ts`: it reads the body as
 * it arrives, aborts (and rejects) when the body errors or its deadline
 * passes, and otherwise answers with whatever `state.upload` resolves.
 */
export interface FakeUploadState {
  upload: (
    kind: string,
    options: { filename: string; contentType: string },
    bytes: number,
  ) => Promise<unknown>
  aborted: boolean
  uploadedBytes: number
  uploadedType?: string
  syncThrow?: boolean
  /** Sanity answers with this error after the first chunk, mid-body. */
  refuseMidBody?: Error | null
}

export function makeFakeUpload(state: FakeUploadState) {
  return (
    kind: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: { filename: string; contentType: string },
    timeoutMs: number,
  ): Promise<unknown> => {
    if (state.syncThrow) return Promise.reject(new Error('invalid options'))
    state.uploadedBytes = 0
    state.uploadedType = options.contentType
    return new Promise((resolve, reject) => {
      let settled = false
      const reader = body instanceof Uint8Array ? null : body.getReader()
      const settle = (fn: () => void, abort = false) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (abort) {
          state.aborted = true
          void reader?.cancel().catch(() => {})
        }
        fn()
      }
      const timer = setTimeout(
        () => settle(() => reject(new Error('Sanity upload timed out')), true),
        timeoutMs,
      )
      void (async () => {
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              state.uploadedBytes += value.length
              // A refusal mid-body rejects the request; the rest of the body
              // is the caller's to let go, as with a real `fetch`.
              if (state.refuseMidBody) {
                const error = state.refuseMidBody
                return settle(() => reject(error))
              }
            }
          } catch (error) {
            return settle(() => reject(error), true)
          }
        } else state.uploadedBytes = (body as Uint8Array).length
        try {
          const document = await state.upload(
            kind,
            options,
            state.uploadedBytes,
          )
          settle(() => resolve(document))
        } catch (error) {
          settle(() => reject(error))
        }
      })()
    })
  }
}
