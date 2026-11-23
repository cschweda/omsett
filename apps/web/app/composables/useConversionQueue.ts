import { detect, MAX_PIXELS, nameDisagrees, pixelCount, sizeProblem, type Detection } from '@omsett/detect'
import type { Edge, Route } from '@omsett/registry'
import { dimensionProblem, formatById } from '@omsett/registry'
import { conversionBudgetMs, MAX_FILES, PREVIEW_MAX_PIXELS, testHook, TimedOut } from '~/utils/limits'
import { closestLanguage } from '~/utils/languages'
import { namedAs } from '~/utils/naming'
import { registry, router } from '~/utils/registry'

export interface QueueFile {
  id: string
  file: File
  detection: Detection
  /** Set when the file may not be decoded at all (size or pixel guard). */
  problem: string | null
  /** The name's extension claims a different format than the contents. */
  mismatch: boolean
  thumbnail: ImageBitmap | null
  status: 'ready' | 'converting' | 'done' | 'error'
  progress: number
  /**
   * What is happening to the file right now, while a batch runs: in line behind another,
   * fetching the converter it needs, or being converted. Null when nothing is.
   */
  stage: 'waiting' | 'loading' | 'working' | null
  /** When work on this file began, by the page's clock, in milliseconds. */
  startedAt: number | null
  /** The size of the converter being fetched, when the stage is 'loading'. */
  loadingBytes: number
  error: string | null
}

export interface QueueResult {
  id: string
  sourceId: string
  name: string
  formatId: string
  blob: Blob
  /** The engine that produced the final output. */
  engine: string
  inputBytes: number
  /** What an engine found out about the file by reading it, for the person to know. */
  notes: string[]
}

/** A failure whose message is written for the user and can be shown as it is. */
class Refusal extends Error {}

let nextId = 0
const uid = () => `f${++nextId}`

export function useConversionQueue() {
  const engines = useEngines()
  const { announce } = usePoliteAnnouncer()

  const files = ref<QueueFile[]>([])
  const results = ref<QueueResult[]>([])
  const targetId = ref<string | null>(null)
  const converting = ref(false)
  /** The user's quality setting, 1–100. Null when the selected target has no such setting. */
  const quality = ref<number | null>(null)
  /** Said to the user when something was left out: too many files, for one. */
  const notice = ref('')

  // Two settings for the test suite, read from the address bar and honored only on localhost.
  // `?engine=<id>` forces one engine, so each path can be exercised on purpose; an id that is
  // not an engine is ignored. `?timeout=<ms>` shortens the time limit, to prove it works.
  const requestedEngine = import.meta.client ? testHook('engine', location) : null
  const forcedEngine = requestedEngine && engines.info[requestedEngine] ? requestedEngine : null
  const requestedBudget = import.meta.client ? Number(testHook('timeout', location)) : Number.NaN
  const forcedBudgetMs = Number.isFinite(requestedBudget) && requestedBudget > 0 ? requestedBudget : null
  // `?slow=800` holds each file for that long before converting it, so the tests can see the
  // page as it is while work is going on.
  const requestedDelay = import.meta.client ? Number(testHook('slow', location)) : Number.NaN
  const delayMs = Number.isFinite(requestedDelay) && requestedDelay > 0 ? requestedDelay : 0

  // A clock that runs only while a batch does. Everything that counts seconds reads it.
  const now = ref(0)
  /** Where the batch has got to: which file is being worked on, of how many, and since when. */
  const batch = ref<{ position: number; total: number; startedAt: number } | null>(null)
  let ticker: ReturnType<typeof setInterval> | undefined
  function startClock() {
    now.value = performance.now()
    ticker = setInterval(() => (now.value = performance.now()), 250)
  }
  function stopClock() {
    clearInterval(ticker)
    ticker = undefined
  }
  /** Whole seconds since `since`, by the batch's clock. */
  const secondsSince = (since: number | null) => (since === null ? 0 : Math.max(0, Math.floor((now.value - since) / 1000)))

  const convertible = computed(() =>
    files.value.filter((f) => f.detection.kind === 'known' && !f.problem),
  )
  const sourceIds = computed(() =>
    convertible.value.map((f) => (f.detection.kind === 'known' ? f.detection.format.id : '')),
  )
  const targets = computed(() => router.targetsFor(sourceIds.value))
  /** Nothing to offer yet: what a file can become depends on the file. */
  const waiting = computed(() => convertible.value.length === 0)
  const selected = computed(() => targets.value.find((t) => t.format.id === targetId.value && t.route) ?? null)
  /**
   * The quality the registry suggests for the selected target, or null if its encoder has no
   * quality setting. Read from the capability's default options, so no format is named here.
   */
  const defaultQuality = computed(() => {
    const options = selected.value?.route?.edges.at(-1)?.candidates[0]?.defaultOptions
    return typeof options?.quality === 'number' ? options.quality : null
  })
  watch(defaultQuality, (value) => (quality.value = value), { immediate: true })

  /**
   * The choices the selected conversion offers beyond quality: the language of a page, whether
   * a table's first row names its columns, the shape of the result, which sheet of a workbook. Which are offered is read
   * from the capability's default options, so no format is named here; a conversion that
   * offers none leaves this empty.
   */
  const OFFERED = ['language', 'headerRow', 'shape', 'sheet']
  const choices = ref<Record<string, unknown>>({})
  const defaults = computed(() => {
    const options = selected.value?.route?.edges.at(-1)?.candidates[0]?.defaultOptions ?? {}
    return Object.fromEntries(Object.entries(options).filter(([key]) => OFFERED.includes(key)))
  })
  watch(
    defaults,
    (now) => {
      const next: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(now)) {
        // A choice already made is kept when the target changes to another that offers it.
        if (key in choices.value) next[key] = choices.value[key]
        // The language offered first is the browser's own: the best guess at what its user writes in.
        else if (key === 'language' && typeof value === 'string') next[key] = closestLanguage(import.meta.client ? navigator.language : undefined, value)
        else next[key] = value
      }
      choices.value = next
    },
    { immediate: true },
  )

  const canConvert = computed(() => !converting.value && convertible.value.length > 0 && selected.value !== null)
  const overall = computed(() => {
    const active = files.value.filter((f) => f.status !== 'ready')
    if (active.length === 0) return 0
    return active.reduce((sum, f) => sum + f.progress, 0) / active.length
  })

  // A target that stopped being reachable (a file was added or removed) is deselected.
  watch(targets, (list) => {
    if (targetId.value && !list.some((t) => t.format.id === targetId.value && t.route)) targetId.value = null
  })

  const { naming } = useNaming()

  async function add(incoming: Iterable<File>) {
    notice.value = ''
    for (const file of incoming) {
      if (files.value.length >= MAX_FILES) {
        notice.value = `Only the first ${MAX_FILES} files were added.`
        announce(notice.value)
        break
      }
      const detection = await detect(file, registry.formats, file.name)
      const known = detection.kind === 'known'
      const entry: QueueFile = {
        id: uid(),
        file: markRaw(file),
        detection: markRaw(detection),
        problem: known ? sizeProblem(file.size, detection.dimensions) : null,
        mismatch: known && nameDisagrees(file.name, detection.format),
        thumbnail: null,
        status: 'ready',
        progress: 0,
        stage: null,
        startedAt: null,
        loadingBytes: 0,
        error: null,
      }
      files.value.push(entry)
      announce(
        known
          ? `${file.name} added, ${detection.format.name}.`
          : `${file.name} added. Unsupported format.`,
      )
      // Decode for the preview only after the guard has passed, and never on this thread.
      // Only a picture whose size is known and modest: a browser asked to draw one of unknown
      // size, or a hundred of fourteen thousand pixels a side, may run out of memory first.
      const pixels = known ? pixelCount(detection.dimensions) : 0
      if (known && !entry.problem && detection.format.category === 'image' && pixels > 0 && pixels <= PREVIEW_MAX_PIXELS) {
        engines
          .thumbnail(file, 128)
          .then((bitmap) => {
            const current = files.value.find((f) => f.id === entry.id)
            if (current) current.thumbnail = markRaw(bitmap)
            else bitmap.close()
          })
          .catch(() => {
            // No preview. That is not a verdict on the file: a browser cannot draw a TIFF, and
            // it converts all the same. A damaged file is reported when it is converted.
          })
      }
    }
  }

  function remove(id: string) {
    const index = files.value.findIndex((f) => f.id === id)
    if (index < 0) return
    const [removed] = files.value.splice(index, 1)
    removed?.thumbnail?.close()
    results.value = results.value.filter((r) => r.sourceId !== id)
  }

  /** Choose a format and convert to it at once, with its usual settings. */
  async function convertTo(id: string) {
    if (converting.value) return
    select(id)
    if (targetId.value !== id) return
    // The choices offered follow the selection; they are let settle before work starts.
    await nextTick()
    await convertAll()
  }

  function select(id: string) {
    const target = targets.value.find((t) => t.format.id === id)
    if (!target?.route) return
    targetId.value = id
    announce(`${target.format.name} selected.`)
  }

  /** Candidate engines for one hop, in order, minus any this browser or this image rules out. */
  function viable(edge: Edge, pixels: number) {
    return edge.candidates.filter((candidate) => {
      const info = engines.info[candidate.engine]
      if (!info || !info.runtimes.includes('browser')) return false
      if (forcedEngine) return candidate.engine === forcedEngine
      // Can this browser run the engine, and write this particular format with it?
      if (engines.availability.value[`${candidate.engine}>${edge.to}`] !== true) return false
      return info.maxPixels === undefined || pixels <= info.maxPixels
    })
  }

  async function runFile(entry: QueueFile, route: Route) {
    if (entry.detection.kind !== 'known') return
    let blob: Blob = entry.file
    let name = entry.file.name
    // Dimensions are only known for the file as dropped; later hops are not pixel-checked.
    let pixels = pixelCount(entry.detection.dimensions)

    const produced: QueueResult[] = []
    const notes: string[] = []
    let timedOut = false
    let refusal: string | null = null
    for (const [hop, edge] of route.edges.entries()) {
      const from = formatById(registry, edge.from)!
      const to = formatById(registry, edge.to)!
      const last = hop === route.edges.length - 1
      // The first engine that remains runs. If it throws, the next is tried once.
      const attempts = viable(edge, pixels).slice(0, 2)
      let next: Blob | null = null
      for (const candidate of attempts) {
        // The user's quality applies to the final encode, and only if that encoder has one.
        const chosen: Record<string, unknown> = {}
        if (last && quality.value !== null && 'quality' in candidate.defaultOptions) chosen.quality = quality.value
        for (const [key, value] of Object.entries(choices.value)) if (last && key in candidate.defaultOptions) chosen[key] = value
        const options = { ...candidate.defaultOptions, ...chosen }
        // A converter that has not been fetched yet is fetched first, and that can be the
        // longest part. The first word back from the engine means it has arrived.
        const info = engines.info[candidate.engine]
        const fetching = info !== undefined && info.sizeBytes > 0 && !engines.loaded.value.includes(candidate.engine)
        entry.stage = fetching ? 'loading' : 'working'
        entry.loadingBytes = fetching ? info.sizeBytes : 0
        try {
          const outputs = await engines.convert(
            candidate.engine,
            { blob, name, from, to, options, maxPixels: MAX_PIXELS },
            (fraction) => {
              // Word from the worker can arrive after the file is finished, so it only ever
              // moves a file from fetching to converting, and never brings one back to life.
              if (entry.stage === 'loading') entry.stage = 'working'
              if (entry.status === 'converting') entry.progress = (hop + fraction) / route.edges.length
            },
            forcedBudgetMs ?? conversionBudgetMs(pixels),
          )
          // What a step learned by reading the file is kept, whichever step it was.
          for (const output of outputs) if (output.note && !notes.includes(output.note)) notes.push(output.note)
          if (last) {
            for (const [index, output] of outputs.entries()) {
              produced.push({
                // Stable across re-conversions, so a result card keeps its place and its state.
                id: `${entry.id}:${to.id}:${index}`,
                sourceId: entry.id,
                // With whatever the person has asked to have put before and after it, in Settings.
                name: namedAs(output.name, naming.value),
                formatId: output.format,
                blob: markRaw(output.blob),
                engine: candidate.engine,
                inputBytes: entry.file.size,
                notes,
              })
            }
          }
          const first = outputs[0]
          if (!first) throw new Error('The engine returned nothing')
          next = first.blob
          name = first.name
          break
        } catch (error) {
          if (error instanceof TimedOut) timedOut = true
          // An engine's own reason for turning the file away, written to be shown.
          if (error instanceof Error && error.name === 'Refusal') refusal = error.message
          console.warn(`[omsett] ${candidate.engine} failed on ${entry.file.name}`, error)
        }
      }
      if (!next && refusal) throw new Refusal(refusal)
      if (!next && timedOut) throw new Refusal('Stopped: this file took too long to convert')
      if (!next) throw new Error("This file couldn't be converted")
      blob = next
      pixels = 0
    }
    return produced
  }

  /** @param quiet a re-conversion while a setting is moved: no announcements for each one. */
  /** Counts sessions: each "Convert another" starts a new one. */
  let sessions = 0

  async function convertAll({ quiet = false }: { quiet?: boolean } = {}) {
    const target = selected.value
    if (!canConvert.value || !target?.route) return
    converting.value = true
    // "Convert another" ends a session while this may still be waiting on a file. Whatever
    // comes back after that belongs to a session that is over, and is dropped.
    const session = sessions
    const over = () => session !== sessions
    // Earlier results stay on screen until their replacements are ready.
    const fresh: QueueResult[] = []
    const queue = convertible.value
    for (const entry of queue) {
      entry.status = 'converting'
      entry.progress = 0
      entry.stage = 'waiting'
      entry.startedAt = null
      entry.error = null
    }
    startClock()
    batch.value = { position: 0, total: queue.length, startedAt: now.value }

    let lastStep = 0
    const stop = watch(overall, (fraction) => {
      const step = [0.75, 0.5, 0.25].find((s) => fraction >= s && s > lastStep)
      if (step && fraction < 1) {
        lastStep = step
        if (!quiet) announce(`${Math.round(step * 100)} percent.`)
      }
    })

    let done = 0
    for (const entry of queue) {
      if (over()) break
      const source = entry.detection.kind === 'known' ? entry.detection.format.id : ''
      const route = router.route(source, target.format.id)
      batch.value = { ...batch.value!, position: batch.value!.position + 1 }
      entry.startedAt = performance.now()
      entry.stage = 'working'
      try {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (!route) throw new Error("This file couldn't be converted")
        // Known from the header before any work starts: will the target hold a picture this size?
        const size = entry.detection.kind === 'known' ? entry.detection.dimensions : null
        const tooLarge = size && dimensionProblem(target.format, size.width, size.height)
        if (tooLarge) throw new Refusal(tooLarge)
        const made = (await runFile(entry, route)) ?? []
        if (over()) break
        fresh.push(...made)
        entry.progress = 1
        entry.status = 'done'
        done++
      } catch (error) {
        if (over()) break
        entry.status = 'error'
        entry.progress = 1
        entry.error = error instanceof Refusal ? error.message : "This file couldn't be converted"
      }
      entry.stage = null
    }
    stop()
    // The session this batch belonged to is gone: its files, its results and its clock with it.
    if (over()) return
    stopClock()
    batch.value = null

    // Results for other formats stay where they are, so a file can be converted to several.
    // For this format, each new result takes the place of the one it replaces.
    const sources = new Set(queue.map((entry) => entry.id))
    const replacement = new Map(fresh.map((result) => [result.id, result]))
    const kept = results.value
      .filter((result) => !(result.formatId === target.format.id && sources.has(result.sourceId)) || replacement.has(result.id))
      .map((result) => replacement.get(result.id) ?? result)
    results.value = [...kept, ...fresh.filter((result) => !kept.some((other) => other.id === result.id))]
    converting.value = false
    const failed = queue.length - done
    const count = `${done} ${done === 1 ? 'file' : 'files'} converted.`
    if (!quiet || failed > 0) {
      announce(failed > 0 ? `${count} ${failed} could not be converted.` : `${count} Download ready.`)
    }
  }

  // Once there is a result, moving the quality setting converts again, so the comparison and
  // the size follow the slider.
  let requeue: ReturnType<typeof setTimeout> | undefined
  watch([quality, () => JSON.stringify(choices.value)], ([value, chosen], [previous, before]) => {
    const moved = value !== null && previous !== null && value !== previous
    // A choice changed, as against the set of choices changing because the target did.
    const changed = chosen !== before && Object.keys(JSON.parse(chosen) as object).join() === Object.keys(JSON.parse(before) as object).join()
    if ((!moved && !changed) || results.value.length === 0) return
    clearTimeout(requeue)
    // Short enough that the picture keeps up with a hand on the slider, long enough that a
    // drag across fifty values does not start fifty conversions. While one is running, the
    // latest value waits its turn; values in between are skipped.
    requeue = setTimeout(function again() {
      if (converting.value) requeue = setTimeout(again, 60)
      else void convertAll({ quiet: true })
    }, 120)
  })

  function reset() {
    clearTimeout(requeue)
    notice.value = ''
    sessions++
    stopClock()
    batch.value = null
    engines.terminate()
    for (const entry of files.value) entry.thumbnail?.close()
    files.value = []
    results.value = []
    targetId.value = null
    converting.value = false
  }

  return {
    files,
    results,
    targets,
    waiting,
    targetId,
    selected,
    converting,
    quality,
    choices,
    defaultQuality,
    canConvert,
    overall,
    batch,
    secondsSince,
    forcedEngine,
    notice,
    add,
    remove,
    select,
    convertAll,
    convertTo,
    reset,
  }
}
