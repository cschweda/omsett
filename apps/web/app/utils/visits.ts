// Counting visits. Omsett can count how many people use it, with Plausible, which sets no cookie
// and keeps no record of a person. Whether it does on a given visit is decided here, and the
// answer is "no" unless every one of these holds:
//
//   the person running this copy of Omsett has set it up (most copies have not);
//   the visitor has not turned it off in Settings;
//   the visitor's browser has not asked not to be tracked.
//
// No script of Plausible's is loaded, from anywhere. The page's own code reports that a page
// was opened, in one small request to this origin, whose server passes it on. Code from a
// third party never runs in the page where the files are. A file is never part of it, and
// neither is anything about one.

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
  /** The site's name as Plausible knows it ("omsett.com"), from the build's settings; empty where there is none. */
  site: string
  /** What the visitor chose, as stored: 'off', 'on', or nothing. */
  stored: string | null
  doNotTrack: boolean
  privacyControl: boolean
  /** The host this page is served from. Where given, visits are counted only on the named site. */
  host?: string
}

/** A site's name is letters, digits, dots and hyphens, and nothing else. Anything else is no setting. */
export const isSiteName = (site: string) => /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(site)

/** Whether a page at this host is one of the named site's own: the site itself, or a part of it. */
export const servedBy = (site: string, host: string) => host.toLowerCase() === site.toLowerCase() || host.toLowerCase().endsWith(`.${site.toLowerCase()}`)

export function visitCounting(signals: VisitSignals): VisitCounting {
  if (!isSiteName(signals.site)) return 'not-set-up'
  // A copy of Omsett served from somewhere else counts nothing under another site's name.
  if (signals.host !== undefined && !servedBy(signals.site, signals.host)) return 'not-set-up'
  // A browser's request not to be tracked is honoured, whatever is stored.
  if (signals.doNotTrack || signals.privacyControl) return 'off-by-browser'
  return signals.stored === 'off' ? 'off-by-choice' : 'on'
}

/** The signals as they stand in this browser. */
/** @param host where this page is served from, for a site named by the build; left out where a test names the site */
export function visitSignals(site: string, host?: string): VisitSignals {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(VISITS_SETTING)
  } catch {
    // Storage that cannot be read is storage with nothing in it.
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return { site, stored, doNotTrack: nav.doNotTrack === '1', privacyControl: nav.globalPrivacyControl === true, host }
}

/**
 * Everything that is reported about a visit: that a page of this site was opened, which page,
 * and what page linked to it. The page's address is given without anything after a "?" or a
 * "#", so nothing typed into the address bar goes with it.
 */
export function visitReport(site: string, origin: string, path: string, referrer: string) {
  return { name: 'pageview', domain: site, url: `${origin}${path}`, referrer: referrer || null }
}
