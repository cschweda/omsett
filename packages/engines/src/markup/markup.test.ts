import { formatById, registry } from '@omsett/registry'
import { describe, expect, it } from 'vitest'
import { Refusal } from '../util'
import { createMarkupEngine } from './index'

async function convert(text: string, from: string, to: string, name = `page.${from}`) {
  const [output] = await createMarkupEngine().convert({
    blob: new Blob([text]),
    name,
    from: formatById(registry, from)!,
    to: formatById(registry, to)!,
    options: {},
    signal: new AbortController().signal,
    onProgress: () => {},
  })
  return output!.blob.text()
}
const body = (html: string) => html.slice(html.indexOf('<body>') + 7, html.indexOf('</body>')).trim()

describe('Markdown to HTML', () => {
  it('writes a whole page, titled by its first heading', async () => {
    const html = await convert('# Hello & 1 < 2\n\nWords.\n', 'md', 'html')
    expect(html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">')).toBe(true)
    expect(html).toContain('<title>Hello &amp; 1 &lt; 2</title>')
    expect(body(html)).toBe('<h1>Hello &#x26; 1 &#x3C; 2</h1>\n<p>Words.</p>')
  })

  it('titles a page with no heading by its file name', async () => {
    expect(await convert('Just words.\n', 'md', 'html', 'My notes.md')).toContain('<title>My notes</title>')
  })

  it('keeps tables, task lists, strikethrough and footnotes that link both ways', async () => {
    const html = body(await convert('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n\n~~no~~ yes[^1]\n\n[^1]: note\n', 'md', 'html'))
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<input type="checkbox" checked disabled>')
    expect(html).toContain('<del>no</del>')
    const target = /href="#([^"]+)"/.exec(html)![1]!
    expect(html).toContain(`id="${target}"`)
  })

  it('keeps what a picture is described as', async () => {
    expect(body(await convert('![A red kite](kite.png)\n', 'md', 'html'))).toBe('<p><img src="kite.png" alt="A red kite"></p>')
  })

  it('keeps harmless HTML written inside Markdown, and nothing that could run', async () => {
    const html = body(
      await convert(
        '<details><summary>More</summary>Kept</details>\n\n<script>alert(1)</script>\n\n<b onclick="x()">bold</b> [x](javascript:alert(2)) <iframe src="//e.example"></iframe>\n\n<style>p{display:none}</style>\n',
        'md',
        'html',
      ),
    )
    expect(html).toContain('<details><summary>More</summary>Kept</details>')
    expect(html).toContain('<b>bold</b>')
    for (const gone of ['script', 'alert', 'onclick', 'javascript:', 'iframe', 'style', 'display']) {
      expect(html.includes(gone), gone).toBe(false)
    }
  })
})

describe('HTML to Markdown', () => {
  it('keeps the content and leaves out the head, scripts and styles, text and all', async () => {
    const md = await convert(
      '<!doctype html><html><head><title>T</title><style>p{color:red}</style><script>track()</script></head><body><h1>Title</h1><p>Hello <em>there</em> and <strong>you</strong>.</p><script>more()</script></body></html>',
      'html',
      'md',
    )
    expect(md).toBe('# Title\n\nHello *there* and **you**.\n')
  })

  it('writes lists, tables, code and pictures as Markdown', async () => {
    const md = await convert(
      '<ul><li>one</li><li>two</li></ul><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><pre><code class="language-js">let a = 1 &lt; 2\n</code></pre><p><img src="kite.png" alt="A red kite"></p>',
      'html',
      'md',
    )
    expect(md).toContain('- one\n- two')
    expect(md).toContain('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(md).toContain('```js\nlet a = 1 < 2\n```')
    expect(md).toContain('![A red kite](kite.png)')
  })

  it('drops links that are code and keeps their words', async () => {
    const md = await convert('<p><a href="javascript:alert(1)">click</a> <a href="https://omsett.com" onclick="x()">site</a></p>', 'html', 'md')
    expect(md.includes('javascript')).toBe(false)
    expect(md).toContain('[site](https://omsett.com)')
    expect(md).toContain('click')
  })

  it('refuses a page with no text in it', async () => {
    const failure = await convert('<!doctype html><html><head><script>x()</script></head><body></body></html>', 'html', 'md').then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Refusal)
    expect((failure as Error).message).toBe('This file has no text in it to convert')
  })

  it('comes back from HTML as the Markdown it started as', async () => {
    const start = '# Title\n\nA paragraph with *emphasis*, **weight**, `code` and a [link](https://omsett.com).\n\n- one\n- two\n\n> quoted\n'
    expect(await convert(await convert(start, 'md', 'html'), 'html', 'md')).toBe(start)
  })

  it('writes text that looks like Markdown so that it stays text', async () => {
    const md = await convert('<p>[x](javascript:alert(1)) *not emphasis* # not a heading</p>', 'html', 'md')
    expect(md).toContain('\\[x]')
    expect(md).toContain('\\*not emphasis\\*')
    // Read back, it is still one paragraph of plain words, with no link in it.
    const back = await convert(md, 'md', 'html')
    expect(back.includes('<a')).toBe(false)
    expect(back.includes('<em>')).toBe(false)
  })
})

describe('nesting', () => {
  it('refuses Markdown lists nested for their own sake, at once', async () => {
    const lists = Array.from({ length: 1000 }, (_, i) => `${' '.repeat(2 * i)}- level`).join('\n')
    const started = performance.now()
    await expect(convert(lists, 'md', 'html')).rejects.toThrow('This file is nested too deeply to convert')
    expect(performance.now() - started).toBeLessThan(2000)
  })

  it('still converts a list nested as deep as anyone writes one, and a wide block of code', async () => {
    const lists = Array.from({ length: 12 }, (_, i) => `${' '.repeat(2 * i)}- level ${i}`).join('\n')
    expect(await convert(lists, 'md', 'html')).toContain('level 11')
    const art = `\`\`\`\n${`${' '.repeat(300)}*\n`.repeat(20)}\`\`\`\n`
    expect(await convert(art, 'md', 'html')).toContain('<pre><code>')
  })

  it('refuses a page nested thousands of tags deep', async () => {
    const page = `${'<div>'.repeat(10_000)}deep${'</div>'.repeat(10_000)}`
    await expect(convert(page, 'html', 'md')).rejects.toThrow('This file is nested too deeply to convert')
  })
})
