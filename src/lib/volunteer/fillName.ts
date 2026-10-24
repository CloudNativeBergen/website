/**
 * `{{name}}` -> the volunteer's name; JSON-escaped when filling portable text
 * JSON. Line breaks are stripped so a name cannot inject subject header lines.
 */
export function fillVolunteerName(text: string, name: string, json = false) {
  const clean = name.replace(/[\r\n]+/g, ' ')
  const value = json ? JSON.stringify(clean).slice(1, -1) : clean
  return text.replace(/\{\{\s*name\s*\}\}/g, () => value)
}
