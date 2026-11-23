// The start of a text file, made safe and small enough to put on the page.

/** No more of a file than this is read for a preview, however large the file is. */
export const PREVIEW_BYTES = 64 * 1024
export const PREVIEW_LINES = 200
export const PREVIEW_COLUMNS = 500

export interface TextPreview {
  lines: string[]
  /** True when the file goes on past what is shown. */
  more: boolean
}

const REPLACEMENT = String.fromCodePoint(0xFFFD)

/** Whether a character would be invisible, or would change how the line around it is displayed. */
function hidden(code: number): boolean {
  if (code === 0x09) return false
  if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) return true
  // Marks that reverse the direction of text, used to make a line read as something it is not.
  return code === 0x200E || code === 0x200F || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069)
}

function visible(line: string): string {
  let out = ''
  for (const char of line) out += hidden(char.codePointAt(0)!) ? REPLACEMENT : char
  return out
}

/** The first lines of some bytes, read as UTF-8. `whole` says whether these are all the bytes. */
export function previewOf(bytes: Uint8Array, whole: boolean): TextPreview {
  // The decoder drops a byte-order mark by itself, and never throws: bad bytes become a mark.
  const text = new TextDecoder('utf-8').decode(bytes)
  const all = text.split(/\r\n|\r|\n/)
  // The last line of a sample is cut wherever the sample ended; of a whole file, it is the
  // nothing after the final line break.
  if (!whole || all.at(-1) === '') all.pop()
  let more = !whole || all.length > PREVIEW_LINES
  const lines = all.slice(0, PREVIEW_LINES).map((line) => {
    const characters = [...line.slice(0, PREVIEW_COLUMNS * 2)]
    if (characters.length <= PREVIEW_COLUMNS && line.length <= PREVIEW_COLUMNS * 2) return visible(line)
    more = true
    return `${visible(characters.slice(0, PREVIEW_COLUMNS).join(''))}…`
  })
  return { lines, more }
}

export async function previewBlob(blob: Blob): Promise<TextPreview> {
  const bytes = new Uint8Array(await blob.slice(0, PREVIEW_BYTES).arrayBuffer())
  return previewOf(bytes, blob.size <= PREVIEW_BYTES)
}
