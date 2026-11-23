// Counting visits. Omsett can count how many people use it, with Plausible, which sets no cookie
// and keeps no record of a person. Whether it does on a given visit is decided here, and the
// answer is "no" unless every one of these holds:
//
//   the person running this copy of Omsett has set it up (most copies have not);
//   the visitor has not turned it off in Settings;
//   the visitor's browser has not asked not to be tracked.
//
// A file is never part of it. What is counted is that a page was opened.

/** Where the choice is kept on the visitor's device. */
export const VISITS_SETTING = 'omsett:count-visits'

export type VisitCounting =
  /** Being counted. */
  | 'on'
  /** The visitor turned it off. */
  | 'off-by-choice'
  /** The browser asks not to be tracked (Do Not Track, or Global Privacy Control). */
  | 'off-by-browser'
  /** This copy of Omsett does not count visits at all. */
  | 'not-set-up'

export interface VisitSignals {
  /** The script's address on this origin, from the build's settings; empty where there is none. */
  script: string
  /** What the visitor chose, as stored: 'off', 'on', or nothing. */
  stored: string | null
  doNotTrack: boolean
  privacyControl: boolean
}

/**
 * The script must be on this origin: an address that begins with one slash and not two. A
 * setting that names another site is treated as no setting, so that no configuration can make
 * the page load code from elsewhere.
 */
export const ownOrigin = (script: string) => /^\/[^/\\]/.test(script)

export function visitCounting(signals: VisitSignals): VisitCounting {
  if (!ownOrigin(signals.script)) return 'not-set-up'
  // A browser's request not to be tracked is honoured, whatever is stored.
  if (signals.doNotTrack || signals.privacyControl) return 'off-by-browser'
  return signals.stored === 'off' ? 'off-by-choice' : 'on'
}

/** The signals as they stand in this browser. */
export function visitSignals(script: string): VisitSignals {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(VISITS_SETTING)
  } catch {
    // Storage that cannot be read is storage with nothing in it.
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return { script, stored, doNotTrack: nav.doNotTrack === '1', privacyControl: nav.globalPrivacyControl === true }
}
