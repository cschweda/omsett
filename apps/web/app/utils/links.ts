export const REPOSITORY = 'https://github.com/cschweda/omsett'
export const CHANGELOG = `${REPOSITORY}/blob/main/CHANGELOG.md`
export const NOTICES = `${REPOSITORY}/blob/main/THIRD-PARTY-NOTICES.md`

/** The site's pages, in the order both navigations list them. */
export const pages = [
  { to: '/about', label: 'About' },
  { to: '/technical', label: 'Technical details' },
  { to: '/whats-new', label: 'What’s new' },
] as const
