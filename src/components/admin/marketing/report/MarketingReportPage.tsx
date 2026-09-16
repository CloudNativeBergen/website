'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PresentationChartLineIcon } from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { api } from '@/lib/trpc/client'
import type { ReportInput } from '@/lib/marketing/report/types'
import { isCalendarDate } from '@/lib/time'
import { ReportSections } from './ReportSections'

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function MarketingReportPage() {
  const [input, setInput] = useState<ReportInput>({ grain: 'daily' })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const report = api.marketing.report.get.useQuery(input)
  const pdf = api.marketing.report.exportPdf.useMutation()
  const csv = api.marketing.report.exportCsv.useMutation()
  const view = report.data
  const busy = pdf.isPending || csv.isPending
  const selectedFrom = from || view?.range.from || input.from || ''
  const selectedTo = to || view?.range.to || input.to || ''
  async function exportReport(kind: 'pdf' | 'csv') {
    setError(null)
    try {
      if (kind === 'csv') {
        const result = await csv.mutateAsync(input)
        download(
          new Blob([result.csv], { type: 'text/csv;charset=utf-8' }),
          'marketing-report.csv',
        )
      } else {
        const result = await pdf.mutateAsync(input)
        const bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0))
        download(
          new Blob([bytes], { type: 'application/pdf' }),
          'marketing-report.pdf',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    }
  }
  const control =
    'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900'
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<PresentationChartLineIcon />}
        title="Marketing Report"
        description={
          view?.conference.title ?? 'Stored observations for this edition'
        }
      />
      <Link
        href="/admin/marketing"
        className="inline-block text-sm text-brand-cloud-blue dark:text-blue-300"
      >
        ← Marketing plan
      </Link>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (
            !isCalendarDate(selectedFrom) ||
            !isCalendarDate(selectedTo) ||
            selectedFrom >= selectedTo
          ) {
            setError('Choose valid dates with From earlier than Before.')
            return
          }
          setError(null)
          setInput({ ...input, from: selectedFrom, to: selectedTo })
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            className={control}
            type="date"
            required
            value={selectedFrom}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Before (exclusive)
          <input
            className={control}
            type="date"
            required
            value={selectedTo}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className={control} type="submit" disabled={report.isFetching}>
          Apply range
        </button>
        <button
          className={control}
          type="button"
          onClick={() => {
            setError(null)
            setFrom('')
            setTo('')
            setInput({ grain: input.grain })
          }}
        >
          Reset range
        </button>
        <label className="flex flex-col gap-1 text-sm">
          Grain
          <select
            className={control}
            value={input.grain}
            onChange={(e) =>
              setInput({
                ...input,
                grain: e.target.value as 'daily' | 'weekly',
              })
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <button
          type="button"
          className={control}
          disabled={busy || !view}
          onClick={() => void exportReport('pdf')}
        >
          {pdf.isPending ? 'Rendering PDF…' : 'Export PDF'}
        </button>
        <button
          type="button"
          className={control}
          disabled={busy || !view}
          onClick={() => void exportReport('csv')}
        >
          {csv.isPending ? 'Preparing CSV…' : 'Export CSV'}
        </button>
      </form>
      <p className="text-sm text-gray-500">
        The default range includes the final day of the plan&apos;s seven-day
        attribution grace. Dates select observations, not activity in the
        selected period.
      </p>
      {(error || report.error) && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">
          {error ?? report.error?.message}
        </p>
      )}
      {report.isPending && (
        <div className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      )}
      {view && <ReportSections view={view} />}
    </div>
  )
}
