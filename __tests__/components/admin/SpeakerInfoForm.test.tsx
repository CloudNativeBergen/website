/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SpeakerInfoForm } from '@/components/admin/SpeakerInfoForm'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const mutate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/trpc/client', () => ({
  api: {
    conference: {
      updateSpeakerInfo: {
        useMutation: () => ({ mutate, isPending: false }),
      },
    },
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
// The real editor needs a browser selection API; the rows are what's tested.
vi.mock('@/components/PortableTextEditor', () => ({
  PortableTextEditor: () => null,
}))

afterEach(() => {
  cleanup()
  mutate.mockReset()
})

const renderForm = (props: Parameters<typeof SpeakerInfoForm>[0]) =>
  render(
    <NotificationProvider>
      <SpeakerInfoForm {...props} />
    </NotificationProvider>,
  )

describe('SpeakerInfoForm routes', () => {
  it('removes the right route and keeps the others keyed', () => {
    renderForm({
      initial: {
        dinner: {
          routes: [
            { _key: 'a', label: 'Walk' },
            { _key: 'b', label: 'Bus' },
          ],
        },
      },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /remove route/i })[0])
    expect(screen.getByLabelText('Label')).toHaveProperty('value', 'Bus')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate.mock.calls[0][0].dinner.routes).toEqual([
      { _key: 'b', label: 'Bus' },
    ])
  })

  it('adds a new route with a key', () => {
    renderForm({})
    fireEvent.click(screen.getByRole('button', { name: /add route/i }))
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Walk' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const route = mutate.mock.calls[0][0].dinner.routes[0]
    expect(route._key).toMatch(/^route-/)
    expect(route.label).toBe('Walk')
  })

  it('drops empty dinner and onsiteContact', () => {
    renderForm({})
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate.mock.calls[0][0].dinner).toBeUndefined()
    expect(mutate.mock.calls[0][0].onsiteContact).toBeUndefined()
  })
})
