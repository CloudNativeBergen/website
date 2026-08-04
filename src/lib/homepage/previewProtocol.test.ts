import { describe, it, expect } from 'vitest'
import {
  PREVIEW_DEVICE_WIDTH,
  PREVIEW_PROTOCOL_VERSION,
  isPreviewMessageEvent,
  isPreviewOutboundMessage,
  isPreviewReadyMessage,
  isPreviewStateMessage,
  previewHoverMessage,
  previewReadyMessage,
  previewSelectMessage,
  previewSizeMessage,
  previewStateMessage,
  type PreviewUiState,
} from './previewProtocol'
import type { HomepageSection } from './sections'

const ui: PreviewUiState = {
  mode: 'design',
  scheme: 'light',
  focusKey: null,
  hoverKey: null,
}

const sections: HomepageSection[] = [{ _key: 'a', _type: 'homepageHero' }]

describe('previewProtocol — envelopes', () => {
  it('stamps the version on every message', () => {
    for (const message of [
      previewReadyMessage(),
      previewStateMessage(sections, ui),
      previewHoverMessage('a'),
      previewSelectMessage('a'),
      previewSizeMessage(1200),
    ]) {
      expect(message.v).toBe(PREVIEW_PROTOCOL_VERSION)
      expect(typeof message.type).toBe('string')
    }
  })

  it('round-trips a state push through its own guard', () => {
    const message = previewStateMessage(sections, {
      ...ui,
      focusKey: 'a',
      hoverKey: 'b',
    })
    expect(isPreviewStateMessage(message)).toBe(true)
    expect(message.sections).toEqual(sections)
    expect(message.ui.focusKey).toBe('a')
  })

  it('survives a structured-clone round trip (the real transport)', () => {
    const message = previewStateMessage(sections, ui)
    const cloned = structuredClone(message)
    expect(isPreviewStateMessage(cloned)).toBe(true)
    expect(cloned).toEqual(message)
  })
})

describe('previewProtocol — guards reject rather than throw', () => {
  const junk = [
    undefined,
    null,
    0,
    'konf-preview-state',
    [],
    {},
    { type: 'konf-preview-state' },
    { type: 'something-else', v: 1 },
  ]

  it('ignores junk of every shape', () => {
    for (const value of junk) {
      expect(isPreviewStateMessage(value)).toBe(false)
      expect(isPreviewReadyMessage(value)).toBe(false)
      expect(isPreviewOutboundMessage(value)).toBe(false)
    }
  })

  it('ignores a state message from a different protocol version', () => {
    const future = { ...previewStateMessage(sections, ui), v: 99 }
    expect(isPreviewStateMessage(future)).toBe(false)
  })

  it('ignores a state message whose payload would crash the renderer', () => {
    expect(
      isPreviewStateMessage({
        ...previewStateMessage(sections, ui),
        sections: 'not-an-array',
      }),
    ).toBe(false)
    expect(
      isPreviewStateMessage({
        ...previewStateMessage(sections, ui),
        ui: { mode: 'nonsense', scheme: 'light' },
      }),
    ).toBe(false)
    expect(
      isPreviewStateMessage({ ...previewStateMessage(sections, ui), ui: null }),
    ).toBe(false)
  })

  it('type-checks the outbound payloads it accepts', () => {
    expect(isPreviewOutboundMessage(previewHoverMessage(null))).toBe(true)
    expect(isPreviewOutboundMessage(previewSelectMessage('a'))).toBe(true)
    expect(isPreviewOutboundMessage(previewSizeMessage(10))).toBe(true)
    expect(
      isPreviewOutboundMessage({ type: 'konf-preview-select', v: 1, key: 7 }),
    ).toBe(false)
    expect(
      isPreviewOutboundMessage({
        type: 'konf-preview-size',
        v: 1,
        height: '9',
      }),
    ).toBe(false)
    // A state push is INBOUND; it must not be accepted as something the preview
    // sent, or a hostile frame could drive the composer's own state.
    expect(isPreviewOutboundMessage(previewStateMessage(sections, ui))).toBe(
      false,
    )
  })
})

describe('previewProtocol — origin check', () => {
  const origin = 'https://admin.example'

  it('accepts only same-origin, well-formed events', () => {
    expect(
      isPreviewMessageEvent({ origin, data: previewReadyMessage() }, origin),
    ).toBe(true)
  })

  it('drops a well-formed message from another origin', () => {
    expect(
      isPreviewMessageEvent(
        { origin: 'https://evil.example', data: previewReadyMessage() },
        origin,
      ),
    ).toBe(false)
  })

  it('drops a same-origin event carrying something else entirely', () => {
    // React DevTools, Vite HMR and browser extensions all postMessage here.
    expect(
      isPreviewMessageEvent(
        { origin, data: { source: 'react-devtools-bridge' } },
        origin,
      ),
    ).toBe(false)
  })
})

describe('previewProtocol — device frames', () => {
  it('pins the two truthful widths', () => {
    // 390 is a real iPhone viewport; 1440 is the desktop layout width the pane
    // scales down. Changing either changes what organizers are shown.
    expect(PREVIEW_DEVICE_WIDTH.mobile).toBe(390)
    expect(PREVIEW_DEVICE_WIDTH.desktop).toBe(1440)
  })
})
