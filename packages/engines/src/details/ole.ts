import type { Cfb } from '@omsett/detect'

// Who wrote an old Office file and with what. Word, Excel and PowerPoint before 2007 all keep
// it in the same stream, as a short list of numbered values. Only the few that are plain text
// are read; each length is checked against the stream before it is used.

const WANTED: Record<number, string> = { 2: 'Title', 3: 'Subject', 4: 'Author', 8: 'Last changed by', 18: 'Made with' }

/** The values of that stream worth showing, by what each is. A stream that cannot be followed gives none. */
export function writtenBy(file: Cfb): Array<{ label: string; value: string }> {
  try {
    const stream = file.stream('\u0005SummaryInformation')
    if (!stream || stream.length < 48) return []
    const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength)
    const section = view.getUint32(44, true)
    if (section + 8 > stream.length) return []
    const count = Math.min(view.getUint32(section + 4, true), 64)
    const found: Array<{ label: string; value: string }> = []
    for (let i = 0; i < count && section + 16 + i * 8 <= stream.length; i++) {
      const label = WANTED[view.getUint32(section + 8 + i * 8, true)]
      const at = section + view.getUint32(section + 12 + i * 8, true)
      // Type 30 is text in the file's own code page, with its length before it.
      if (!label || at + 8 > stream.length || view.getUint32(at, true) !== 0x1E) continue
      const long = view.getUint32(at + 4, true)
      if (long > 2000 || at + 8 + long > stream.length) continue
      const raw = stream.subarray(at + 8, at + 8 + long)
      const end = raw.indexOf(0)
      // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
      const value = new TextDecoder('latin1').decode(end < 0 ? raw : raw.subarray(0, end)).replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, 300)
      if (value) found.push({ label, value })
    }
    return found
  } catch {
    return []
  }
}

/** Whether the file carries macros: programs kept inside it. They are never run and never carried over. */
export const hasMacros = (file: Cfb): boolean => file.names.some((name) => /^(?:_VBA_PROJECT(?:_CUR)?|VBA|Macros)$/i.test(name))
