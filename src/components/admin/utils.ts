export { default as classNames } from 'clsx'

export interface ErrorDisplayProps {
  title: string
  message: string
  backLink?: {
    href: string
    label: string
  }
  homeLink?: boolean
}
