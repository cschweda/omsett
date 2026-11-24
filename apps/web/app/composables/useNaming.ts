import { DEFAULT_NAMING, NAMING_SETTING, readNaming, type Naming } from '~/utils/naming'

/** The words a person has asked to have put before and after the names of converted files. */
export function useNaming() {
  const naming = useState<Naming>('file-naming', () => ({ ...DEFAULT_NAMING }))
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
      // The default is kept by keeping nothing; anything else, no words at all included, is kept as it is.
      if (naming.value.prefix === DEFAULT_NAMING.prefix && naming.value.suffix === DEFAULT_NAMING.suffix) localStorage.removeItem(NAMING_SETTING)
      else localStorage.setItem(NAMING_SETTING, JSON.stringify(naming.value))
    } catch {
      // Without storage the choice lasts as long as the page does.
    }
  }

  return { naming, set }
}
