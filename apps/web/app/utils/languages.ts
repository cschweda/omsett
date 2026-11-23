// The languages offered for a page made from Markdown, each under its own name. The tag is
// what is written into the page (its `lang`), so that it is read aloud in the right voice.
export const languages: Array<{ tag: string; name: string }> = [
  { tag: 'en', name: 'English' },
  { tag: 'es', name: 'Español' },
  { tag: 'fr', name: 'Français' },
  { tag: 'de', name: 'Deutsch' },
  { tag: 'it', name: 'Italiano' },
  { tag: 'pt', name: 'Português' },
  { tag: 'nl', name: 'Nederlands' },
  { tag: 'pl', name: 'Polski' },
  { tag: 'sv', name: 'Svenska' },
  { tag: 'nb', name: 'Norsk bokmål' },
  { tag: 'da', name: 'Dansk' },
  { tag: 'fi', name: 'Suomi' },
  { tag: 'cs', name: 'Čeština' },
  { tag: 'el', name: 'Ελληνικά' },
  { tag: 'uk', name: 'Українська' },
  { tag: 'ru', name: 'Русский' },
  { tag: 'tr', name: 'Türkçe' },
  { tag: 'ar', name: 'العربية' },
  { tag: 'he', name: 'עברית' },
  { tag: 'fa', name: 'فارسی' },
  { tag: 'ur', name: 'اردو' },
  { tag: 'hi', name: 'हिन्दी' },
  { tag: 'bn', name: 'বাংলা' },
  { tag: 'zh-Hans', name: '中文（简体）' },
  { tag: 'zh-Hant', name: '中文（繁體）' },
  { tag: 'ja', name: '日本語' },
  { tag: 'ko', name: '한국어' },
  { tag: 'vi', name: 'Tiếng Việt' },
  { tag: 'th', name: 'ไทย' },
  { tag: 'id', name: 'Bahasa Indonesia' },
  { tag: 'tl', name: 'Tagalog' },
]

/** The offered language closest to what a browser says its user reads: "fr-CA" is "fr". */
export function closestLanguage(preferred: string | undefined, fallback: string): string {
  if (!preferred) return fallback
  const wanted = preferred.toLowerCase()
  const exact = languages.find((language) => language.tag.toLowerCase() === wanted)
  if (exact) return exact.tag
  if (wanted.startsWith('zh')) return /hant|tw|hk|mo/.test(wanted) ? 'zh-Hant' : 'zh-Hans'
  const primary = wanted.split('-')[0]
  // Norwegian is offered as bokmål, whichever way the browser names it.
  const alias = primary === 'no' || primary === 'nn' ? 'nb' : primary
  return languages.find((language) => language.tag.toLowerCase() === alias)?.tag ?? fallback
}
