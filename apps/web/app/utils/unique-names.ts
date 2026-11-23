/**
 * Names for files going into one folder, where no two may be the same: the second "photo.webp"
 * becomes "photo (2).webp". Compared without regard to case, as most computers compare them.
 */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>()
  return names.map((name) => {
    const dot = name.lastIndexOf('.')
    const [base, ending] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
    let candidate = name
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ending}`
    taken.add(candidate.toLowerCase())
    return candidate
  })
}
