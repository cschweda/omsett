import { detect, nameDisagrees, pixelCount, sizeProblem, type Detection } from '@omsett/detect'
import type { Edge, Route } from '@omsett/registry'
import { formatById } from '@omsett/registry'
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

let nextId = 0
const uid = () => `f${++nextId}`

export function useConversionQueue() {
  const engines = useEngines()
  const { announce } = usePoliteAnnouncer()

  const files = ref<QueueFile[]>([])
  const results = ref<QueueResult[]>([])
  const targetId = ref<string | null>(null)
  const converting = ref(false)
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
    let engineUsed = ''
    // Dimensions are only known for the file as dropped; later hops are not pixel-checked.
    let pixels = pixelCount(entry.detection.dimensions)

    for (const [hop, edge] of route.edges.entries()) {
      const from = formatById(registry, edge.from)!
      const to = formatById(registry, edge.to)!
      // The first engine that remains runs. If it throws, the next is tried once.
      const attempts = viable(edge, pixels).slice(0, 2)
      let produced: Blob | null = null
      for (const candidate of attempts) {
        try {
          const outputs = await engines.convert(
            candidate.engine,
            { blob, name, from, to, options: candidate.defaultOptions },
            (fraction) => {
              entry.progress = (hop + fraction) / route.edges.length
            },
          )
          const last = hop === route.edges.length - 1
          if (last) {
            for (const output of outputs) {
              results.value.push({
                id: uid(),
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
          produced = first.blob
          name = first.name
          engineUsed = candidate.engine
          break
        } catch (error) {
          console.warn(`[omsett] ${candidate.engine} failed on ${entry.file.name}`, error)
        }
      }
      if (!produced) throw new Error("This file couldn't be converted")
      blob = produced
      pixels = 0
    }
    return engineUsed
  }

  async function convertAll() {
    const target = selected.value
    if (!canConvert.value || !target?.route) return
    converting.value = true
    results.value = []
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
        await runFile(entry, route)
        entry.progress = 1
        entry.status = 'done'
        done++
      } catch {
        entry.status = 'error'
        entry.progress = 1
        entry.error = "This file couldn't be converted"
      }
    }

    stop()
    converting.value = false
    const failed = queue.length - done
    const count = `${done} ${done === 1 ? 'file' : 'files'} converted.`
    announce(
      failed > 0
        ? `${count} ${failed} could not be converted.`
        : `${count} Download ready.`,
    )
  }

  function reset() {
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
