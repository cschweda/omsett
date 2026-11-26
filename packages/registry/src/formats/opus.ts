import type { Format } from '../types'

export const opus: Format = {
  id: 'opus',
  name: 'Opus',
  category: 'audio',
  extensions: ['opus'],
  mime: ['audio/opus'],
  detect: ['opus'],
  explain:
    'Opus is the newest open sound format: free of patents, used for calls and voice messages by WhatsApp, Discord and most video-call apps. It leaves out sound to stay small, and sounds better at a small size than any other format.',
  lossy: 'always',
  traits: ['metadata'],
}
