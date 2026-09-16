import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName, PDFArray, PDFRawStream } from 'pdf-lib'

/** Read real standard-font react-pdf output, including text split into kerning runs. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const runs: string[] = []
  for (const page of document.getPages()) {
    const content = page.node.get(PDFName.of('Contents'))
    const entries =
      content instanceof PDFArray ? content.asArray() : content ? [content] : []
    for (const entry of entries) {
      const stream = document.context.lookup(entry)
      if (!(stream instanceof PDFRawStream)) continue
      const bytes = Buffer.from(stream.contents)
      const source = (
        stream.dict.get(PDFName.of('Filter'))?.toString() === '/FlateDecode'
          ? inflateSync(bytes)
          : bytes
      ).toString('latin1')
      for (const line of source.split('\n')) {
        if (!/T[Jj]$/.test(line.trim())) continue
        const hex = line.match(/<([0-9a-f]*)>/gi)
        if (hex)
          runs.push(
            hex
              .map((part) =>
                Buffer.from(part.slice(1, -1), 'hex').toString('latin1'),
              )
              .join(''),
          )
      }
    }
  }
  if (runs.length === 0)
    throw new Error('No PDF text decoded: extractor or renderer changed')
  return runs
    .join(' ')
    .replace(/[\u00a0\u2009\u0009]/g, ' ')
    .replace(/[\u0096\u0097]/g, '-')
    .replace(/\s+/g, ' ')
}
