/**
 * @vitest-environment jsdom
 *
 * ONE WRITE. The Send modal (#1261) keeps the template a draft started from
 * in EmailModal's `additionalFields`, relying on this hook to save them in the
 * SAME localStorage record as the subject and body. If they were ever saved
 * separately again, a quick close after applying a template could reopen one
 * draft's text under another template's id.
 */
import { renderHook, act } from '@testing-library/react'
import { useEmailModalStorage } from '@/hooks/useEmailModalStorage'

const KEY = 'sponsor-send-information-sfc-test'
const blocks = [
  {
    _type: 'block',
    _key: 'b',
    children: [{ _type: 'span', _key: 's', text: 'Hello' }],
  },
]

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('useEmailModalStorage', () => {
  it('writes subject, body and additionalFields as ONE record in ONE setItem call', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHook(() =>
      useEmailModalStorage({
        storageKey: KEY,
        isOpen: true,
        autoSaveDelay: 50,
      }),
    )
    act(() => {
      result.current.autoSave('Subject', blocks, {
        templateId: 'tpl-1',
        templateRecipientKeys: 'c-primary',
      })
    })
    expect(setItem).not.toHaveBeenCalled() // debounced
    act(() => {
      vi.advanceTimersByTime(60)
    })
    const writes = setItem.mock.calls.filter(([k]) => k === KEY)
    expect(writes).toHaveLength(1)
    const stored = JSON.parse(writes[0][1] as string)
    expect(stored).toMatchObject({
      subject: 'Subject',
      message: blocks,
      additionalFields: {
        templateId: 'tpl-1',
        templateRecipientKeys: 'c-primary',
      },
    })
  })

  it('a later autosave within the debounce window supersedes the earlier one entirely', () => {
    const { result } = renderHook(() =>
      useEmailModalStorage({
        storageKey: KEY,
        isOpen: true,
        autoSaveDelay: 50,
      }),
    )
    act(() => {
      result.current.autoSave('Draft A', blocks, { templateId: 'tpl-A' })
    })
    act(() => {
      result.current.autoSave('Draft B', blocks, { templateId: 'tpl-B' })
      vi.advanceTimersByTime(60)
    })
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    // Never "A's text with B's template": the pair that lands is B's.
    expect(stored.subject).toBe('Draft B')
    expect(stored.additionalFields).toEqual({ templateId: 'tpl-B' })
  })
})
