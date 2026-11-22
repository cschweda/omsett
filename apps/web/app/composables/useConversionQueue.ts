import { detect, nameDisagrees, pixelCount, sizeProblem, type Detection } from '@omsett/detect'
import type { Edge, Route } from '@omsett/registry'
import { dimensionProblem, formatById } from '@omsett/registry'
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
  /** `?engine=<id>` forces one engine, so each path can be exercised on purpose. */
  const forcedEngine = import.meta.client ? new URLSearchParams(location.search).get('engine') : null

  const convertible = computed(() =>
    files.value.filter((f) => f.detection.kind === 'known' && !f.problem),
  )
  const sourceIds = computed(() =>
    convertible.value.map((f) => (f.detection.kind === 'known' ? f.detection.format.id : '')),
  )
  const targets = computed(() => router.targetsFor(sourceIds.value))
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

  async function add(incoming: Iterable<File>) {
    for (const file of incoming) {
      const detection = await detect(file, registry.formats)
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
        error: null,
      }
      files.value.push(entry)
      announce(
        known
          ? `${file.name} added, ${detection.format.name}.`
          : `${file.name} added. Unsupported format.`,
      )
      // Decode for the preview only after the guard has passed, and never on this thread.
      if (known && !entry.problem && detection.format.category === 'image') {
        engines
          .thumbnail(file, 128)
          .then((bitmap) => {
            const current = files.value.find((f) => f.id === entry.id)
            if (current) current.thumbnail = markRaw(bitmap)
            else bitmap.close()
          })
          .catch(() => {
            const current = files.value.find((f) => f.id === entry.id)
            if (current) current.error = "This file couldn't be read"
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
      if (engines.availability.value[candidate.engine] !== true) return false
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
    for (const [hop, edge] of route.edges.entries()) {
      const from = formatById(registry, edge.from)!
      const to = formatById(registry, edge.to)!
      const last = hop === route.edges.length - 1
      // The first engine that remains runs. If it throws, the next is tried once.
      const attempts = viable(edge, pixels).slice(0, 2)
      let next: Blob | null = null
      for (const candidate of attempts) {
        // The user's quality applies to the final encode, and only if that encoder has one.
        const options =
          last && quality.value !== null && 'quality' in candidate.defaultOptions
            ? { ...candidate.defaultOptions, quality: quality.value }
            : candidate.defaultOptions
        try {
          const outputs = await engines.convert(
            candidate.engine,
            { blob, name, from, to, options },
            (fraction) => {
              entry.progress = (hop + fraction) / route.edges.length
            },
          )
          if (last) {
            for (const [index, output] of outputs.entries()) {
              produced.push({
                // Stable across re-conversions, so a result card keeps its place and its state.
                id: `${entry.id}:${index}`,
                sourceId: entry.id,
                name: output.name,
                formatId: output.format,
                blob: markRaw(output.blob),
                engine: candidate.engine,
                inputBytes: entry.file.size,
              })
            }
          }
          const first = outputs[0]
          if (!first) throw new Error('The engine returned nothing')
          next = first.blob
          name = first.name
          break
        } catch (error) {
          console.warn(`[omsett] ${candidate.engine} failed on ${entry.file.name}`, error)
        }
      }
      if (!next) throw new Error("This file couldn't be converted")
      blob = next
      pixels = 0
    }
    return produced
  }

  async function convertAll() {
    const target = selected.value
    if (!canConvert.value || !target?.route) return
    converting.value = true
    // Earlier results stay on screen until their replacements are ready.
    const fresh: QueueResult[] = []
    const queue = convertible.value
    for (const entry of queue) {
      entry.status = 'converting'
      entry.progress = 0
      entry.error = null
    }

    let lastStep = 0
    const stop = watch(overall, (fraction) => {
      const step = [0.75, 0.5, 0.25].find((s) => fraction >= s && s > lastStep)
      if (step && fraction < 1) {
        lastStep = step
        announce(`${Math.round(step * 100)} percent.`)
      }
    })

    let done = 0
    for (const entry of queue) {
      const source = entry.detection.kind === 'known' ? entry.detection.format.id : ''
      const route = router.route(source, target.format.id)
      try {
        if (!route) throw new Error("This file couldn't be converted")
        // Known from the header before any work starts: will the target hold a picture this size?
        const size = entry.detection.kind === 'known' ? entry.detection.dimensions : null
        const tooLarge = size && dimensionProblem(target.format, size.width, size.height)
        if (tooLarge) throw new Refusal(tooLarge)
        fresh.push(...((await runFile(entry, route)) ?? []))
        entry.progress = 1
        entry.status = 'done'
        done++
      } catch (error) {
        entry.status = 'error'
        entry.progress = 1
        entry.error = error instanceof Refusal ? error.message : "This file couldn't be converted"
      }
    }

    stop()
    results.value = fresh
    converting.value = false
    const failed = queue.length - done
    const count = `${done} ${done === 1 ? 'file' : 'files'} converted.`
    announce(
      failed > 0
        ? `${count} ${failed} could not be converted.`
        : `${count} Download ready.`,
    )
  }

  // Once there is a result, moving the quality setting converts again, so the comparison and
  // the size follow the slider.
  let requeue: ReturnType<typeof setTimeout> | undefined
  watch(quality, (value, previous) => {
    if (value === null || previous === null || results.value.length === 0) return
    clearTimeout(requeue)
    requeue = setTimeout(function again() {
      if (converting.value) requeue = setTimeout(again, 150)
      else void convertAll()
    }, 350)
  })

  function reset() {
    clearTimeout(requeue)
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
    targetId,
    selected,
    converting,
    quality,
    defaultQuality,
    canConvert,
    overall,
    forcedEngine,
    add,
    remove,
    select,
    convertAll,
    reset,
  }
}
