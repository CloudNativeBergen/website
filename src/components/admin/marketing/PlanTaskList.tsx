'use client'

import Link from 'next/link'
import {
  MARKETING_CHANNEL_LABELS,
  TASK_KIND_LABELS,
  type PlanView,
  type TaskView,
} from '@/lib/marketing/types'
import { STATUS_LABELS } from './timeline-model'
import { Th, Td, compactDue } from './table-cells'

/** Both plan views receive the same filtered, ordered tasks from their parent. */
export function PlanTaskList({
  view,
  tasks,
}: {
  view: PlanView
  tasks: TaskView[]
}) {
  const campaignNames = new Map(view.campaigns.map((c) => [c._id, c.title]))
  const organizerNames = new Map(view.organizers.map((o) => [o._id, o.name]))

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
        <caption className="sr-only">Marketing plan tasks</caption>
        <thead className="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            <Th>Task</Th>
            <Th>Kind</Th>
            <Th>Channel</Th>
            <Th>Campaign</Th>
            <Th>Due</Th>
            <Th>Assignee</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
          {tasks.map((task) => (
            <tr key={task._id}>
              <Td>
                <Link
                  href={`/admin/marketing/tasks/${task._id}`}
                  className="font-medium text-brand-cloud-blue hover:underline dark:text-blue-300"
                >
                  {task.title}
                </Link>
              </Td>
              <Td>{TASK_KIND_LABELS[task.kind]}</Td>
              <Td>
                {task.channel ? MARKETING_CHANNEL_LABELS[task.channel] : '—'}
              </Td>
              <Td>
                <Link
                  href={`/admin/marketing/campaigns/${task.campaignId}`}
                  className="text-brand-cloud-blue hover:underline dark:text-blue-300"
                >
                  {campaignNames.get(task.campaignId) ?? '—'}
                </Link>
              </Td>
              <Td>{compactDue(task.date)}</Td>
              <Td>
                {/* An assignee reference is weak and survives the organizer
                    leaving the roster, so "no name in the roster" is not the
                    same answer as "nobody is assigned". Both rendered as an em
                    dash, hiding that the Task still belongs to someone. The
                    quick popover already distinguishes the two. */}
                {task.assigneeId ? (
                  (organizerNames.get(task.assigneeId) ?? (
                    <span className="text-gray-500 italic dark:text-gray-400">
                      Former organizer
                    </span>
                  ))
                ) : (
                  <>&mdash;</>
                )}
              </Td>
              <Td>{STATUS_LABELS[task.status]}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
