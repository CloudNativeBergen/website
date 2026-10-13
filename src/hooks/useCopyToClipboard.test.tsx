/**
 * @vitest-environment jsdom
 *
 * `useCopyToClipboard`: the path its callers that pass a STRING have always
 * taken, which the pending-text path added for #1346 must leave as it was,
 * and that new path.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopyToClipboard } from './useCopyToClipboard'

const writeText = vi.fn()
const write = vi.fn()

class FakeClipboardItem {
  constructor(public items: Record<string, Promise<Blob>>) {}
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  writeText.mockResolvedValue(undefined)
  write.mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('copying a string', () => {
  it('writes it in the same turn as the call, and says copied for the timeout', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useCopyToClipboard({ timeout: 2000, onSuccess }),
    )

    let copying: Promise<void> = Promise.resolve()
    act(() => {
      copying = result.current.copyToClipboard('the text')
      // Before anything is awaited: the write is already made.
      expect(writeText.mock.calls).toEqual([['the text']])
    })
    await act(() => copying)

    expect(result.current.copied).toBe(true)
    expect(onSuccess.mock.calls).toEqual([['the text']])
    act(() => vi.advanceTimersByTime(1999))
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.copied).toBe(false)
  })

  it('never goes through a ClipboardItem, also where the browser has one', async () => {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    Object.assign(navigator, { clipboard: { write, writeText } })
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copyToClipboard('the text'))

    expect(write).not.toHaveBeenCalled()
    expect(writeText.mock.calls).toEqual([['the text']])
  })

  it('a copy that fails reports the error and leaves an earlier "copied" running its time', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useCopyToClipboard({ onError }))
    await act(() => result.current.copyToClipboard('first'))
    expect(result.current.copied).toBe(true)

    writeText.mockRejectedValueOnce(new Error('NotAllowedError'))
    await act(() => result.current.copyToClipboard('second'))

    expect(onError.mock.calls.map(([error]) => error.message)).toEqual([
      'NotAllowedError',
    ])
    expect(result.current.failed).toBe(true)
    // As before the hook knew about failure: still copied, until its timeout.
    expect(result.current.copied).toBe(true)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.copied).toBe(false)
  })

  it('without a clipboard API it copies through a textarea, and leaves none behind', async () => {
    Object.assign(navigator, { clipboard: undefined })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.assign(document, { execCommand })
    const { result } = renderHook(() => useCopyToClipboard())

    await act(() => result.current.copyToClipboard('the text'))

    expect(execCommand.mock.calls).toEqual([['copy']])
    expect(result.current.copied).toBe(true)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })
})

describe('copying a text that is still on its way', () => {
  it('writes a ClipboardItem at once and fills it in when the text arrives', async () => {
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    Object.assign(navigator, { clipboard: { write, writeText } })
    let arrive: (text: string) => void = () => {}
    const pending = new Promise<string>((resolve) => {
      arrive = resolve
    })
    const { result } = renderHook(() => useCopyToClipboard())

    let copying: Promise<void> = Promise.resolve()
    act(() => {
      copying = result.current.copyToClipboard(pending)
      expect(write).toHaveBeenCalledTimes(1)
    })
    arrive('the address')
    await act(() => copying)

    const [item] = write.mock.calls[0][0] as FakeClipboardItem[]
    expect(await (await item.items['text/plain']).text()).toBe('the address')
    expect(writeText).not.toHaveBeenCalled()
    expect(result.current.copied).toBe(true)
  })

  it('reset forgets the outcome', async () => {
    const { result } = renderHook(() => useCopyToClipboard())
    await act(() => result.current.copyToClipboard('the text'))
    expect(result.current.copied).toBe(true)

    act(() => result.current.reset())

    expect(result.current.copied).toBe(false)
    expect(result.current.failed).toBe(false)
  })
})
