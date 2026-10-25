'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import type { PortableTextBlock } from '@portabletext/editor'
import { Input } from '@/components/Form'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'
import type { TypedObject } from 'sanity'
import type { SpeakerInfo, SpeakerInfoRoute } from '@/lib/conference/types'
import { instantToOsloLocalInput, osloLocalInputToIso } from '@/lib/time'

type Blocks = PortableTextBlock[] | undefined
// The editor's block type and Sanity's `TypedObject` describe the same JSON.
const typed = (v: PortableTextBlock[]) => v as unknown as TypedObject[]

// Times are entered and shown as conference (Europe/Oslo) wall-clock, whatever
// the organizer's own time zone.
const toLocalInput = instantToOsloLocalInput
const fromLocalInput = (v?: string) => osloLocalInputToIso(v) ?? undefined

const str = (s?: string) => s?.trim() || undefined
const blk = (b?: TypedObject[]) => (b && b.length > 0 ? b : undefined)

/** Blank fields are omitted so an empty section stays absent on save. */
function buildPayload(info: SpeakerInfo) {
  const d = info.dinner ?? {}
  return {
    dinner: {
      startsAt: fromLocalInput(d.startsAt),
      venueName: str(d.venueName),
      address: str(d.address),
      mapUrl: str(d.mapUrl),
      rsvpNote: str(d.rsvpNote),
      description: blk(d.description),
      routes: d.routes?.map((r) => ({
        _key: r._key,
        label: str(r.label),
        meetingPoint: str(r.meetingPoint),
        meetingPointMapUrl: str(r.meetingPointMapUrl),
        departsNote: str(r.departsNote),
        departsAt: fromLocalInput(r.departsAt),
        details: blk(r.details),
      })),
    },
    checkIn: blk(info.checkIn),
    equipment: blk(info.equipment),
    onsiteContact: {
      name: str(info.onsiteContact?.name),
      phone: str(info.onsiteContact?.phone),
      email: str(info.onsiteContact?.email),
    },
    accommodation: blk(info.accommodation),
    extra: blk(info.extra),
  }
}

export function SpeakerInfoForm({ initial }: { initial?: SpeakerInfo }) {
  const router = useRouter()
  const { showNotification } = useNotification()
  // Datetimes are held as datetime-local strings while editing.
  const [info, setInfo] = useState<SpeakerInfo>(() => ({
    ...initial,
    dinner: {
      ...initial?.dinner,
      startsAt: toLocalInput(initial?.dinner?.startsAt),
      routes: initial?.dinner?.routes?.map((r) => ({
        ...r,
        departsAt: toLocalInput(r.departsAt),
      })),
    },
  }))

  const mutation = api.conference.updateSpeakerInfo.useMutation({
    onSuccess: () => {
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Speaker info saved',
        message: 'The speaker briefing was updated.',
      })
    },
    onError: (error) =>
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save speaker info.',
      }),
  })

  const dinner = info.dinner ?? {}
  const routes = dinner.routes ?? []
  const setDinner = (patch: Partial<NonNullable<SpeakerInfo['dinner']>>) =>
    setInfo((i) => ({ ...i, dinner: { ...i.dinner, ...patch } }))
  const setRoute = (idx: number, patch: Partial<SpeakerInfoRoute>) =>
    setDinner({
      routes: routes.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    })
  const setContact = (
    patch: Partial<NonNullable<SpeakerInfo['onsiteContact']>>,
  ) =>
    setInfo((i) => ({ ...i, onsiteContact: { ...i.onsiteContact, ...patch } }))

  const richText = (
    key: 'checkIn' | 'equipment' | 'accommodation' | 'extra',
    label: string,
    helpText: string,
  ) => (
    <PortableTextEditor
      label={label}
      helpText={helpText}
      value={info[key] as Blocks}
      onChange={(v) => setInfo((i) => ({ ...i, [key]: typed(v) }))}
    />
  )

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(buildPayload(info))
      }}
    >
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Speaker dinner
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Input
              name="dinner-startsAt"
              label="Starts at"
              type="datetime-local"
              value={dinner.startsAt ?? ''}
              setValue={(v) => setDinner({ startsAt: v })}
            />
          </div>
          <div>
            <Input
              name="dinner-venueName"
              label="Venue name"
              value={dinner.venueName ?? ''}
              setValue={(v) => setDinner({ venueName: v })}
            />
          </div>
          <div>
            <Input
              name="dinner-address"
              label="Address"
              value={dinner.address ?? ''}
              setValue={(v) => setDinner({ address: v })}
            />
          </div>
          <div>
            <Input
              name="dinner-mapUrl"
              label="Map URL"
              type="url"
              value={dinner.mapUrl ?? ''}
              setValue={(v) => setDinner({ mapUrl: v })}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              name="dinner-rsvpNote"
              label="RSVP note"
              placeholder="RSVP on your speaker ticket"
              value={dinner.rsvpNote ?? ''}
              setValue={(v) => setDinner({ rsvpNote: v })}
            />
          </div>
        </div>
        <PortableTextEditor
          label="Description"
          value={dinner.description as Blocks}
          onChange={(v) => setDinner({ description: typed(v) })}
        />

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Routes to the dinner
          </h3>
          {routes.map((r, idx) => (
            <div
              key={r._key ?? idx}
              className="space-y-4 rounded-md border border-gray-200 p-4 dark:border-gray-700"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Input
                    name={`route-${idx}-label`}
                    label="Label"
                    value={r.label ?? ''}
                    setValue={(v) => setRoute(idx, { label: v })}
                  />
                </div>
                <div>
                  <Input
                    name={`route-${idx}-meetingPoint`}
                    label="Meeting point"
                    value={r.meetingPoint ?? ''}
                    setValue={(v) => setRoute(idx, { meetingPoint: v })}
                  />
                </div>
                <div>
                  <Input
                    name={`route-${idx}-departsAt`}
                    label="Departs at"
                    type="datetime-local"
                    value={r.departsAt ?? ''}
                    setValue={(v) => setRoute(idx, { departsAt: v })}
                  />
                </div>
                <div>
                  <Input
                    name={`route-${idx}-meetingPointMapUrl`}
                    label="Meeting point map URL"
                    type="url"
                    value={r.meetingPointMapUrl ?? ''}
                    setValue={(v) => setRoute(idx, { meetingPointMapUrl: v })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    name={`route-${idx}-departsNote`}
                    label="Departure note (instead of a time)"
                    placeholder="When the workshops are over"
                    value={r.departsNote ?? ''}
                    setValue={(v) => setRoute(idx, { departsNote: v })}
                  />
                </div>
              </div>
              <PortableTextEditor
                label="Details"
                compact
                value={r.details as Blocks}
                onChange={(v) => setRoute(idx, { details: typed(v) })}
              />
              <AdminButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDinner({ routes: routes.filter((_, i) => i !== idx) })
                }
              >
                <TrashIcon className="h-4 w-4" />
                Remove route
              </AdminButton>
            </div>
          ))}
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDinner({ routes: [...routes, {}] })}
          >
            <PlusIcon className="h-4 w-4" />
            Add route
          </AdminButton>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          On-site contact
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Input
              name="contact-name"
              label="Name"
              value={info.onsiteContact?.name ?? ''}
              setValue={(v) => setContact({ name: v })}
            />
          </div>
          <div>
            <Input
              name="contact-phone"
              label="Phone"
              type="tel"
              value={info.onsiteContact?.phone ?? ''}
              setValue={(v) => setContact({ phone: v })}
            />
          </div>
          <div>
            <Input
              name="contact-email"
              label="Email"
              type="email"
              value={info.onsiteContact?.email ?? ''}
              setValue={(v) => setContact({ email: v })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        {richText('checkIn', 'Check-in', 'Where and when speakers check in.')}
        {richText(
          'equipment',
          'Equipment',
          'Projector, adapters, clickers, microphones.',
        )}
        {richText(
          'accommodation',
          'Accommodation',
          'Hotel and booking details.',
        )}
        {richText(
          'extra',
          'Additional information',
          'Anything else speakers need.',
        )}
      </section>

      <div className="flex items-center gap-4">
        <AdminButton type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save'}
        </AdminButton>
        {initial?.updatedAt && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Last updated {new Date(initial.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </form>
  )
}
