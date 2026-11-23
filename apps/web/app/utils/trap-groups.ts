/** The kinds of trap file, as the pages name them, keyed by the manifest's group. */
export const trapGroups: Record<string, string> = {
  identity: 'Not what they say they are',
  size: 'Lying about their size',
  damage: 'Damaged',
  unusual: 'Sound, but unusual',
  data: 'Data: broken, hostile, or misnamed',
  subtitles: 'Subtitles: broken, hostile, or misnamed',
  text: 'Markdown and HTML: hostile, bottomless, or misnamed',
  fonts: 'Fonts: damaged, lying about their size, or misnamed',
  contacts: 'Contacts and calendars: unfinished, bottomless, or written to inject',
  archives: 'Archives: bombs, files named to escape, and lists that lie',
  workbooks: 'Workbooks: bombs, formulas that run programs, and parts that point elsewhere',
  documents: 'Word documents: bombs, things fetched from elsewhere, and words meant to be gone',
  slides: 'Presentations: bombs, links that run programs, and what the audience was not shown',
  scripts: 'Screenplays: bombs, manifests that lie, and what the writer set aside',
  pdf: 'PDF: programs that run on opening, pages that hold themselves, tags that tell nothing',
  code: 'Code: one adversarial payload planted in every format, to show that nothing runs',
}
