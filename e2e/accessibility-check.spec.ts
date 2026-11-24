// Checking a document's accessibility: the one thing that sends a file off the device, and
// only when the person has been told and has said to. The checker itself is played by the test.
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { FIXTURE, open } from './helpers'

const fixture = (path: string) => fileURLToPath(new URL(`../fixtures/${path}`, import.meta.url))
const CHECKER = 'https://checker.example'
const SET_UP = `/?accessibility=${encodeURIComponent(CHECKER)}`
const ID = 'a'.repeat(32)

/** Stands in for the server, and keeps note of everything that was sent to it. */
async function checker(page: Page, analyze: { status: number; body?: unknown } = { status: 200, body: { overallScore: 82.4, grade: 'B', filename: 'sample.docx', seal: 'x' } }) {
  const sent: Array<{ path: string; method: string; body: string }> = []
  await page.route('**/api/accessibility/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    sent.push({ path, method: request.method(), body: request.postData() ?? '' })
    if (path.endsWith('/health')) return route.fulfill({ json: { status: 'ok' } })
    if (path.endsWith('/analyze')) return route.fulfill({ status: analyze.status, json: analyze.body ?? { error: 'no' } })
    if (path.endsWith('/reports')) return route.fulfill({ json: { id: ID } })
    return route.fulfill({ status: 404, body: '' })
  })
  return sent
}

test('a copy of Omsett that is not set up for it offers no check and sends nothing', async ({ page }) => {
  const sent = await checker(page)
  await open(page)
  await page.locator('#file-input').setInputFiles(fixture('docx/sample.docx'))
  await expect(page.locator('.file-card')).toHaveCount(1)
  await expect(page.getByTestId('check-toggle')).toHaveCount(0)
  await page.goto('/status')
  await expect(page.getByTestId('checker-state')).toHaveText('Not set up on this copy of Omsett.')
  expect(sent).toEqual([])
})

test('nothing is sent until the person has read where the file goes and pressed send', async ({ page, baseURL }) => {
  const home = new URL(baseURL!).origin
  const elsewhere: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== home) elsewhere.push(request.url())
  })
  const sent = await checker(page)
  await open(page, SET_UP)
  await page.locator('#file-input').setInputFiles([fixture('docx/sample.docx'), FIXTURE])
  const cards = page.locator('.file-card')
  await expect(cards).toHaveCount(2)
  // Offered for the document, and not for the picture.
  await expect(cards.nth(0).getByTestId('check-toggle')).toHaveCount(1)
  await expect(cards.nth(1).getByTestId('check-toggle')).toHaveCount(0)

  await page.getByTestId('check-toggle').click()
  const panel = page.getByTestId('check')
  await expect(panel).toContainText('This sends the file to a server.')
  await expect(panel).toContainText('checker.example')
  // Who wrote the checker is said only of the one whose author is known.
  await expect(page.getByTestId('check-maker')).toHaveCount(0)
  await expect(panel).toContainText('The checker does not keep the file.')
  await expect(panel).toContainText('It asks another server for part of the audit.')
  await expect(panel).toContainText('It keeps the report')
  expect(sent).toEqual([])
  // Declined: closed, and still nothing sent.
  await page.getByTestId('check-cancel').click()
  await expect(panel).toHaveCount(0)
  expect(sent).toEqual([])

  await page.getByTestId('check-toggle').click()
  await page.getByTestId('check-send').click()
  await expect(page.getByTestId('check-score')).toHaveText('Accessibility: 82 out of 100, grade B.')
  const link = page.getByTestId('check-report')
  await expect(link).toHaveAttribute('href', `${CHECKER}/report/${ID}`)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener')

  // The file went once, to this origin, and the report was saved once. Nothing went elsewhere.
  expect(sent.map((request) => `${request.method} ${request.path}`)).toEqual(['POST /api/accessibility/analyze', 'POST /api/accessibility/reports'])
  expect(sent[0]!.body).toContain('filename="sample.docx"')
  expect(elsewhere).toEqual([])
  // And the file still converts here, as ever. (The picture is set aside: the two share no format to become.)
  await cards.nth(1).getByRole('button', { name: /^Remove/ }).click()
  await expect(cards).toHaveCount(1)
  await page.getByRole('radio', { name: /HTML/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  expect(sent).toHaveLength(2)
})

test('a checker that is busy says so, and what it answers is believed only if it reads as a score', async ({ page }) => {
  await checker(page, { status: 503 })
  await open(page, SET_UP)
  await page.locator('#file-input').setInputFiles(fixture('pdf/sample.pdf'))
  await page.getByTestId('check-toggle').click()
  await page.getByTestId('check-send').click()
  await expect(page.getByTestId('check-failed')).toHaveText('The checker is busy. Try again in a minute.')

  await page.unroute('**/api/accessibility/**')
  await checker(page, { status: 200, body: { overallScore: '<img src=x onerror=alert(1)>', grade: '<b>A</b>' } })
  await page.getByTestId('check-toggle').click()
  await page.getByTestId('check-toggle').click()
  await page.getByTestId('check-send').click()
  await expect(page.getByTestId('check-failed')).toHaveText('The checker did not answer. The file was not checked.')
})

test('the Status page says whether the checker is up, and that converting does not depend on it', async ({ page }) => {
  await checker(page)
  await page.goto(`/status?accessibility=${encodeURIComponent(CHECKER)}`)
  await expect(page.getByTestId('checker-state')).toHaveText('Up and answering.')
  await expect(page.locator('#status-checker').locator('..')).toContainText('never needed to convert a file')

  await page.unroute('**/api/accessibility/**')
  await page.route('**/api/accessibility/**', (route) => route.fulfill({ status: 502, body: '' }))
  await page.reload()
  await expect(page.getByTestId('checker-state')).toHaveText('Not answering.')
})

test('the checker at audit.icjia.app is said to be by the same author, and its report opens from a button', async ({ page }) => {
  await checker(page)
  await open(page, `/?accessibility=${encodeURIComponent('https://audit.icjia.app')}`)
  await page.locator('#file-input').setInputFiles(fixture('xlsx/sample.xlsx'))
  await page.getByTestId('check-toggle').click()
  await expect(page.getByTestId('check-maker')).toHaveText('It is written by the same author as Omsett, Christopher Schweda.')
  await page.getByTestId('check-send').click()
  const report = page.getByTestId('check-report')
  await expect(report).toHaveAttribute('href', `https://audit.icjia.app/report/${ID}`)
  await expect(report).toHaveClass(/button/)
  await expect(page.getByTestId('check')).toContainText('It can be saved or printed from there.')
})

test('a converted file can be checked too, asked the same way, and a new conversion is a new file', async ({ page }) => {
  const sent = await checker(page)
  await open(page, SET_UP)
  await page.locator('#file-input').setInputFiles(fixture('json/sample.json'))
  // Data is not a kind a checker reads, so the file as added has no check; the workbook made from it has.
  await expect(page.getByTestId('check-toggle')).toHaveCount(0)
  await page.locator('[role="radio"][data-format="xlsx"]').click()
  await page.getByTestId('convert').click()
  const result = page.locator('.result-card')
  await expect(result).toHaveCount(1, { timeout: 30_000 })
  expect(sent).toEqual([])

  await result.getByTestId('result-check-toggle').click()
  await expect(result.getByTestId('check')).toContainText('This sends the file to a server.')
  expect(sent).toEqual([])
  await result.getByTestId('check-send').click()
  await expect(result.getByTestId('check-score')).toHaveText('Accessibility: 82 out of 100, grade B.')
  await expect(result.getByTestId('check-which')).toHaveText('This is the converted file.')
  expect(sent[0]!.path).toBe('/api/accessibility/analyze')
  expect(sent[0]!.body).toContain('filename="sample.xlsx"')
  // A picture made from a picture has no check.
  await page.getByTestId('another').click()
  await page.locator('#file-input').setInputFiles(FIXTURE)
  await page.getByRole('radio', { name: /WebP/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('result-check-toggle')).toHaveCount(0)
})

test('a document shows the check before converting and again on what it becomes', async ({ page }) => {
  await checker(page)
  await open(page, SET_UP)
  await page.locator('#file-input').setInputFiles(fixture('md/sample.md'))
  await page.getByRole('radio', { name: /DOCX/ }).click()
  await page.getByTestId('convert').click()
  await expect(page.locator('.result-card')).toHaveCount(1, { timeout: 30_000 })
  await expect(page.getByTestId('result-check-toggle')).toHaveCount(1)
})
