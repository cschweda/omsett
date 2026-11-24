// The last thing done to a PDF before it is handed back.
//
// A PDF may carry a title and still be announced by its file name: a viewer shows the title,
// and a screen reader reads it, only where the document asks for that (DisplayDocTitle, which
// W3C's technique PDF18 sets for WCAG 2.4.2). Typst writes the title and does not ask. Without
// it a Word document that scores full marks for its title becomes a PDF that does not.
//
// The PDF is not rewritten. One object is added at its end, the way the format provides for:
// the catalog again, asking for the title to be shown, with a short table that says where it
// is and points back to the table before it. Everything Typst wrote stays byte for byte.

const latin = (bytes: Uint8Array) => {
  let text = ''
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192))
  return text
}

/**
 * The PDF, asking its viewer to show its title. `null` where the file is not laid out as Typst
 * lays one out (a plain table of where things are, the catalog in the open), so that the caller
 * can say so and nothing is guessed at.
 */
export function titleShown(pdf: Uint8Array): Uint8Array | null {
  // The end of the file says where its table is; the table is followed by the trailer.
  const tail = latin(pdf.subarray(Math.max(0, pdf.length - 2048)))
  const end = /startxref\s+(\d{1,10})\s+%%EOF\s*$/.exec(tail)
  if (!end) return null
  const tableAt = Number(end[1])
  if (tableAt >= pdf.length) return null
  const table = latin(pdf.subarray(tableAt))
  // Done already: the table the file ends on is the short one written here, and the one object
  // it places is a catalog that asks. Then there is nothing to add.
  const short = /^xref\n(\d{1,7}) 1\n(\d{10}) 00000 n\r\ntrailer\n/.exec(table)
  if (short) {
    const placed = Number(short[2])
    const again = placed < tableAt ? latin(pdf.subarray(placed, tableAt)) : ''
    return again.startsWith(`${short[1]} 0 obj\n`) && again.includes('/Type /Catalog') && /\/DisplayDocTitle true/.test(again) ? pdf : null
  }
  const head = /^xref\r?\n0 (\d{1,7})\r?\n/.exec(table)
  if (!head) return null
  const count = Number(head[1])
  const trailerAt = table.indexOf('trailer', head[0].length + count * 20 - 1)
  if (trailerAt < 0) return null
  const trailer = /^trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(table.slice(trailerAt))
  const root = trailer && /\/Root (\d{1,7}) 0 R/.exec(trailer[1]!)
  if (!trailer || !root || /\/Prev\b/.test(trailer[1]!)) return null
  const number = Number(root[1])
  if (number < 1 || number >= count) return null

  // Where the catalog is: its line in the table, twenty bytes to a line.
  const line = table.slice(head[0].length + number * 20, head[0].length + number * 20 + 20)
  const where = /^(\d{10}) 00000 n/.exec(line)
  if (!where) return null
  const at = Number(where[1])
  const opening = `${number} 0 obj`
  if (at + opening.length > tableAt || latin(pdf.subarray(at, at + opening.length)) !== opening) return null
  const catalog = /^\d+ 0 obj\s*(<<[\s\S]*?>>)\s*endobj/.exec(latin(pdf.subarray(at, tableAt)))
  // A catalog holds names and numbers and no text of the document's; one with a string or a stream in it is not one of Typst's.
  if (!catalog || !catalog[1]!.includes('/Type /Catalog') || /stream|\[/.test(catalog[1]!)) return null
  let body = catalog[1]!
  if (/\/DisplayDocTitle\b/.test(body)) return pdf
  body = /\/ViewerPreferences\s*<</.test(body)
    ? body.replace(/\/ViewerPreferences\s*<</, (found) => `${found}\n    /DisplayDocTitle true`)
    : body.replace(/^<</, '<<\n  /ViewerPreferences <<\n    /DisplayDocTitle true\n  >>')

  const start = pdf.length + 1
  const object = `\n${number} 0 obj\n${body}\nendobj\n`
  const added =
    `${object}xref\n${number} 1\n${String(start).padStart(10, '0')} 00000 n\r\n` +
    `trailer\n<<${trailer[1]!.replace(/\s+$/, '')}\n  /Prev ${tableAt}\n>>\nstartxref\n${pdf.length + object.length}\n%%EOF\n`
  const out = new Uint8Array(pdf.length + added.length)
  out.set(pdf)
  for (let i = 0; i < added.length; i++) out[pdf.length + i] = added.charCodeAt(i)
  return out
}
