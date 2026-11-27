import { Refusal } from '../util'

/** The most pages a range may name, repeats included. */
const MAX_TAKEN = 2000

/**
 * The pages a person asked for, in the order asked: "2-5, 9" is 2, 3, 4, 5 and 9; "9, 1" puts the
 * last page first; "4-" runs to the end and "-3" from the start; "5-2" runs backwards. Anything
 * else is refused in words that say what was not understood. The numbers this gives are all that
 * qpdf is told; what the person typed never reaches it.
 */
export function pagesFrom(text: string, count: number): number[] {
  // "2 - 5" is a range, as "2-5" is.
  const parts = text.replace(/\s*([-–—])\s*/g, '$1').split(/[,;\s]+/).filter(Boolean)
  if (parts.length === 0) throw new Refusal('Say which pages to take, such as 2-5, 9')
  const pages: number[] = []
  for (const part of parts) {
    const found = /^(\d{1,6})?(?:([-–—])(\d{1,6})?)?$/.exec(part)
    if (!found || (!found[1] && !found[3])) throw new Refusal(`"${part.slice(0, 20)}" is not a page or a range of pages. Write them as 2-5, 9`)
    const from = found[1] ? Number(found[1]) : 1
    const to = found[2] ? (found[3] ? Number(found[3]) : count) : from
    for (const page of [from, to]) {
      if (page < 1 || page > count) throw new Refusal(`This PDF has ${count.toLocaleString('en')} ${count === 1 ? 'page' : 'pages'}, so there is no page ${page.toLocaleString('en')}`)
    }
    const step = to >= from ? 1 : -1
    for (let page = from; ; page += step) {
      pages.push(page)
      if (pages.length > MAX_TAKEN) throw new Refusal(`That names more than ${MAX_TAKEN.toLocaleString('en')} pages. Take fewer at a time`)
      if (page === to) break
    }
  }
  return pages
}
