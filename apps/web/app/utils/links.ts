export const REPOSITORY = 'https://github.com/cschweda/omsett'
export const CHANGELOG = `${REPOSITORY}/blob/main/CHANGELOG.md`
export const NOTICES = `${REPOSITORY}/blob/main/THIRD-PARTY-NOTICES.md`
export const SECURITY_MD = `${REPOSITORY}/blob/main/SECURITY.md`
export const REPORT = `${REPOSITORY}/security`

/** The site's pages, in the order both navigations list them. */
export const pages = [
  { to: '/about', label: 'About' },
  { to: '/trust', label: 'Trust' },
  { to: '/technical', label: 'Technical details' },
  { to: '/whats-new', label: 'What’s new' },
  { to: '/security', label: 'Security' },
  { to: '/settings', label: 'Settings' },
] as const
