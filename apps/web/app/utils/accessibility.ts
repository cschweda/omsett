// Checking a document's accessibility, which Omsett cannot do itself and a server can.
//
// This is the one thing in Omsett that sends a file off the device, so it is hedged about:
//
//   it exists only on a copy of Omsett set up for it (most are not);
//   it is offered only for the kinds of file a checker reads;
//   nothing is sent until the person has been told, in words, where the file will go and what
//   is kept, and has pressed a button that says "send";
//   the file goes to this copy's own origin, whose server passes it to the checker. The page
//   still asks no other site for anything, and its security policy is the same as without it.
//
// The checker is audit.icjia.app's kind of service: it takes a PDF, Word, PowerPoint or Excel
// file, answers with a score, and can keep the report (not the file) at a private link.
import type { Category } from '@omsett/registry'

/** Where on this origin the checker is reached. The server forwards what arrives here. */
export const CHECK_PATH = '/api/accessibility'
/** The largest file the checker takes. Larger is not sent. */
export const MAX_CHECK_BYTES = 25 * 1024 * 1024
/** The kinds of file a checker reads. */
export const CHECKED: readonly Category[] = ['pdf', 'document', 'presentation', 'spreadsheet']

/**
 * The checker's own site, from the build's setting: "https://audit.icjia.app". Used to say
 * where the file goes and to link to the report. Anything but a plain https site is no setting.
 */
export function checkerSite(setting: string): { origin: string; host: string } | null {
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(setting)) return null
  try {
    const url = new URL(setting)
    return url.origin === setting.toLowerCase() ? { origin: url.origin, host: url.host } : null
  } catch {
    return null
  }
}

export interface Verdict {
  /** 0 to 100. */
  score: number
  /** A letter, as the checker gives it. */
  grade: string
}

/** The score and grade out of what the checker answered, or null if it answered something else. */
export function readVerdict(body: unknown): Verdict | null {
  if (typeof body !== 'object' || body === null) return null
  const { overallScore, grade } = body as { overallScore?: unknown; grade?: unknown }
  if (typeof overallScore !== 'number' || !Number.isFinite(overallScore) || overallScore < 0 || overallScore > 100) return null
  if (typeof grade !== 'string' || !/^[A-F][+-]?$/.test(grade)) return null
  return { score: Math.round(overallScore), grade }
}

/** The address of a saved report on the checker's site, or null if the id is not one. */
export function reportAddress(origin: string, id: unknown): string | null {
  return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id) ? `${origin}/report/${id}` : null
}

/** Why a check did not happen, in words for the person who asked for it. */
export function failureReason(status: number): string {
  if (status === 413) return 'This file is larger than the checker takes (25 MB). It was not checked.'
  if (status === 429) return 'The checker has had as many files from here as it takes for now. Try again in a while.'
  if (status === 503) return 'The checker is busy. Try again in a minute.'
  if (status === 400 || status === 415 || status === 422) return 'The checker could not read this file. It was not checked.'
  return 'The checker did not answer. The file was not checked.'
}
