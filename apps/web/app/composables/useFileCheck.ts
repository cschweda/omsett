import type { Category } from '@omsett/registry'
import { CHECKED, checkerMaker, MAX_CHECK_BYTES } from '~/utils/accessibility'
import { CheckFailed, type CheckResult } from '~/composables/useAccessibilityCheck'

/**
 * One file's accessibility check, as a card shows it: whether it is offered, where the person
 * has got to in being asked, and what came back. Used for a file as it was added and for a
 * file as it was converted, so that both ask in the same words and neither sends by itself.
 */
export function useFileCheck(file: () => File, category: () => Category | undefined) {
  const checker = useAccessibilityCheck()
  // Known only in the browser: on localhost a test may name a checker in the address.
  const site = ref<{ origin: string; host: string } | null>(null)
  onMounted(() => {
    site.value = checker.site()
  })

  const stage = ref<'closed' | 'asking' | 'sending' | 'done' | 'failed'>('closed')
  const result = ref<CheckResult | null>(null)
  const error = ref('')

  const offered = computed(() => {
    const kind = category()
    return site.value !== null && kind !== undefined && CHECKED.includes(kind)
  })

  /** Open the panel, or close it. Opening sends nothing. */
  function toggle() {
    stage.value = stage.value === 'closed' ? (result.value ? 'done' : 'asking') : 'closed'
  }
  /** The person has read where the file goes and has said to send it. */
  async function send() {
    stage.value = 'sending'
    try {
      result.value = await checker.check(file())
      stage.value = 'done'
    } catch (reason) {
      error.value = reason instanceof CheckFailed ? reason.message : 'The checker did not answer. The file was not checked.'
      stage.value = 'failed'
    }
  }
  /** A new file in the same place (converted again) has not been checked. */
  function forget() {
    result.value = null
    stage.value = 'closed'
  }

  return reactive({
    offered,
    stage,
    result,
    error,
    host: computed(() => site.value?.host ?? ''),
    maker: computed(() => (site.value ? checkerMaker(site.value.host) : null)),
    tooLarge: computed(() => file().size > MAX_CHECK_BYTES),
    toggle,
    send,
    forget,
    close: () => {
      stage.value = 'closed'
    },
  })
}

export type FileCheck = ReturnType<typeof useFileCheck>
