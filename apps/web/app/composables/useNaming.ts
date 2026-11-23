import { NAMING_SETTING, NO_NAMING, readNaming, type Naming } from '~/utils/naming'

/** The words a person has asked to have put before and after the names of converted files. */
export function useNaming() {
  const naming = useState<Naming>('file-naming', () => ({ ...NO_NAMING }))
  const read = useState('file-naming-read', () => false)
  if (import.meta.client && !read.value) {
    read.value = true
    try {
      naming.value = readNaming(localStorage.getItem(NAMING_SETTING))
    } catch {
      // Storage that cannot be read is storage with nothing in it.
    }
  }

  function set(next: Naming) {
    naming.value = readNaming(JSON.stringify(next))
    try {
      if (naming.value.prefix === '' && naming.value.suffix === '') localStorage.removeItem(NAMING_SETTING)
      else localStorage.setItem(NAMING_SETTING, JSON.stringify(naming.value))
    } catch {
      // Without storage the choice lasts as long as the page does.
    }
  }

  return { naming, set }
}
