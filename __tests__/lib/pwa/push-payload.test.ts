import { describe, it, expect } from 'vitest'
import { parsePushPayload } from '@/lib/pwa/push-payload'

describe('parsePushPayload', () => {
  it('parses a well-formed JSON payload', () => {
    const result = parsePushPayload(
      JSON.stringify({
        title: 'Talk confirmed',
        body: 'See you there',
        url: '/cfp/proposal/abc',
        tag: 'talk-confirmed',
      }),
    )
    expect(result).toEqual({
      title: 'Talk confirmed',
      body: 'See you there',
      url: '/cfp/proposal/abc',
      tag: 'talk-confirmed',
    })
  })

  it('falls back to defaults for an empty payload', () => {
    const result = parsePushPayload('')
    expect(result.title).toBe('Cloud Native Days')
    expect(result.body).toBe('')
    expect(result.url).toBe('/')
    expect(result.tag).toBeUndefined()
  })

  it('treats a non-JSON string as the body', () => {
    const result = parsePushPayload('just some text')
    expect(result.body).toBe('just some text')
    expect(result.title).toBe('Cloud Native Days')
    expect(result.url).toBe('/')
  })

  it('drops an absolute off-origin url in favour of /', () => {
    const result = parsePushPayload(
      JSON.stringify({ url: 'https://evil.example/steal' }),
    )
    expect(result.url).toBe('/')
  })

  it('drops a protocol-relative url', () => {
    const result = parsePushPayload(JSON.stringify({ url: '//evil.example' }))
    expect(result.url).toBe('/')
  })

  it('keeps a same-origin absolute path', () => {
    const result = parsePushPayload(JSON.stringify({ url: '/cfp/list' }))
    expect(result.url).toBe('/cfp/list')
  })

  it('uses the default title when title is blank', () => {
    const result = parsePushPayload(JSON.stringify({ title: '   ' }))
    expect(result.title).toBe('Cloud Native Days')
  })
})
