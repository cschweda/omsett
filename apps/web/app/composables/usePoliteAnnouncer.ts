/**
 * Named apart from Nuxt's built-in `useAnnouncer`, which can also speak assertively.
 *
 * One polite live region for the whole app. Nothing in a conversion is urgent, so nothing
 * is assertive. The region itself is rendered once, in pages/index.vue.
 */
export function usePoliteAnnouncer() {
  const message = useState('announcer-message', () => '')

  function announce(text: string) {
    // Clear first so an identical message is still spoken.
    message.value = ''
    void nextTick(() => {
      message.value = text
    })
  }

  return { message, announce }
}
