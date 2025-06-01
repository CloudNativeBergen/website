import {
  Level,
  levels,
  Status,
  statuses,
  Language,
  languages,
  Format,
  formats,
  Audience,
  audiences,
} from './types'

export function FormatFormat({ format }: { format?: string }) {
  let text: string
  let color: string

  switch (format) {
    case Format.lightning_10:
      text = formats.get(Format.lightning_10) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.presentation_20:
      text = formats.get(Format.presentation_20) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.presentation_25:
      text = formats.get(Format.presentation_25) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.presentation_40:
      text = formats.get(Format.presentation_40) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.presentation_45:
      text = formats.get(Format.presentation_45) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.workshop_120:
      text = formats.get(Format.workshop_120) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    case Format.workshop_240:
      text = formats.get(Format.workshop_240) ?? format
      color = 'bg-gray-100 text-gray-800'
      break
    default:
      text = 'Unknown'
      color = 'bg-gray-100 text-gray-800'
      break
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {text}
    </span>
  )
}

export function FormatLanguage({ language }: { language?: string }) {
  let text: string
  let color: string

  switch (language) {
    case Language.english:
      text = languages.get(Language.english) ?? language
      color = 'bg-gray-100 text-gray-800'
      break
    case Language.norwegian:
      text = languages.get(Language.norwegian) ?? language
      color = 'bg-gray-100 text-gray-800'
      break
    default:
      text = 'Unknown'
      color = 'bg-gray-100 text-gray-800'
      break
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {text}
    </span>
  )
}

export function FormatAudiences({
  audiences: audienceValues = [],
}: {
  audiences?: Audience[]
}) {
  return (
    <>
      {audienceValues.map((audience, index) => {
        let text: string
        let color: string

        switch (audience) {
          case Audience.developer:
            text = audiences.get(Audience.developer) ?? 'Developer'
            color = 'bg-blue-100 text-blue-800'
            break
          case Audience.architect:
            text = audiences.get(Audience.architect) ?? 'Architect'
            color = 'bg-indigo-100 text-indigo-800'
            break
          case Audience.operator:
            text = audiences.get(Audience.operator) ?? 'Operator'
            color = 'bg-red-100 text-red-800'
            break
          case Audience.manager:
            text = audiences.get(Audience.manager) ?? 'Manager'
            color = 'bg-green-100 text-green-800'
            break
          case Audience.dataEngineer:
            text = audiences.get(Audience.dataEngineer) ?? 'Data Engineer'
            color = 'bg-purple-100 text-purple-800'
            break
          case Audience.securityEngineer:
            text = audiences.get(Audience.securityEngineer) ?? 'Security Engineer'
            color = 'bg-pink-100 text-pink-800'
            break
          case Audience.qaEngineer:
            text = audiences.get(Audience.qaEngineer) ?? 'QA Engineer'
            color = 'bg-yellow-100 text-yellow-800'
            break
          case Audience.devopsEngineer:
            text = audiences.get(Audience.devopsEngineer) ?? 'DevOps Engineer'
            color = 'bg-gray-100 text-gray-800'
            break
          default:
            text = 'Unknown'
            color = 'bg-gray-100 text-gray-800'
            break
        }

        return (
          <span
            key={index}
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color} mr-2 last:mr-0`}
          >
            {text}
          </span>
        )
      })}
    </>
  )
}

export function FormatLevel({ level }: { level?: string }) {
  let text: string
  let color: string

  switch (level) {
    case Level.beginner:
      text = levels.get(Level.beginner) ?? level
      color = 'bg-green-100 text-green-800'
      break
    case Level.intermediate:
      text = levels.get(Level.intermediate) ?? level
      color = 'bg-yellow-100 text-yellow-800'
      break
    case Level.advanced:
      text = levels.get(Level.advanced) ?? level
      color = 'bg-red-100 text-red-800'
      break
    default:
      text = 'Unknown'
      color = 'bg-gray-100 text-gray-800'
      break
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {text}
    </span>
  )
}

export function FormatStatus({ status }: { status?: string }) {
  let text: string
  let color: string

  switch (status) {
    case Status.draft:
      text = statuses.get(Status.draft) ?? status
      color = 'bg-yellow-100 text-yellow-800'
      break
    case Status.submitted:
      text = statuses.get(Status.submitted) ?? status
      color = 'bg-blue-100 text-blue-800'
      break
    case Status.accepted:
      text = statuses.get(Status.accepted) ?? status
      color = 'bg-green-100 text-green-800'
      break
    case Status.rejected:
      text = statuses.get(Status.rejected) ?? status
      color = 'bg-red-100 text-red-800'
      break
    case Status.confirmed:
      text = statuses.get(Status.confirmed) ?? status
      color = 'bg-green-100 text-green-800'
      break
    case Status.withdrawn:
      text = statuses.get(Status.withdrawn) ?? status
      color = 'bg-red-100 text-red-800'
      break
    case Status.deleted:
      text = statuses.get(Status.deleted) ?? status
      color = 'bg-gray-100 text-gray-800'
      break
    default:
      text = 'Unknown'
      color = 'bg-gray-100 text-gray-800'
      break
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {text}
    </span>
  )
}
