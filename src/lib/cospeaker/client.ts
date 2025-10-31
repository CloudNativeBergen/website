'use client'

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function getValidEmails(emails: string[]): string[] {
  return emails.filter((email) => email.trim() && validateEmail(email))
}
