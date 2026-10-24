/** `{{name}}` -> the volunteer's name; JSON-escaped when filling portable text JSON. */
export function fillVolunteerName(text: string, name: string, json = false) {
  const value = json ? JSON.stringify(name).slice(1, -1) : name
  return text.replace(/\{\{\s*name\s*\}\}/g, () => value)
}
