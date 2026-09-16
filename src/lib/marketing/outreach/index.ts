import { resolvePlaceholders } from '../placeholders'
import type { TaskEditorTask, TaskKind } from '../types'

export type OutreachKind = 'speakerOutreach' | 'sponsorOutreach'

export function isOutreach(kind: TaskKind): kind is OutreachKind {
  return kind === 'speakerOutreach' || kind === 'sponsorOutreach'
}

const SKELETONS: Record<OutreachKind, string> = {
  speakerOutreach:
    'Hi {name},\n\nThank you for being part of {event}! Would you help spread the word? You can share this link with your community:\n\n{url}\n\nThank you!',
  sponsorOutreach:
    'Hi {company},\n\nThank you for supporting {event}! Would you share the event with your team and community? Here is your link:\n\n{url}\n\nThank you!',
}

export function outreachBody(
  task: TaskEditorTask,
  event: string,
  link: string | null,
): string | null {
  if (!isOutreach(task.kind) || !task.subject || !link) return null
  if (
    task.subject.type !==
    (task.kind === 'speakerOutreach' ? 'speaker' : 'sponsor')
  )
    return null
  return resolvePlaceholders(SKELETONS[task.kind], {
    name: task.subject.name,
    company: task.subject.name,
    event,
    url: link,
  })
}
