import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Short alert chimes made with Web Audio (no audio files to download).
 * Browsers only allow sound after the user has tapped the page once, so
 * screens ask for one tap to "turn on sound".
 */
let ctx: AudioContext | null = null

function audio() {
  if (!ctx)
    ctx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )()
  return ctx
}

function tone(freq: number, start: number, duration: number, gain = 0.18) {
  const a = audio()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, a.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration)
  osc.connect(g).connect(a.destination)
  osc.start(a.currentTime + start)
  osc.stop(a.currentTime + start + duration + 0.05)
}

export const chimes = {
  /** New kitchen ticket: two rising notes. */
  newTicket: () => {
    tone(784, 0, 0.18)
    tone(1047, 0.18, 0.3)
  },
  /** Guest request / order ready: three quick notes. */
  attention: () => {
    tone(880, 0, 0.12)
    tone(880, 0.16, 0.12)
    tone(1175, 0.32, 0.25)
  },
}

/** Sound on/off per device, plus "unlock" on first tap. */
export function useSound(key: string) {
  const storageKey = `edgex-sound:${key}`
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'on'
    } catch {
      return false
    }
  })
  const [unlocked, setUnlocked] = useState(false)

  const enable = useCallback(
    (on: boolean) => {
      setEnabled(on)
      try {
        localStorage.setItem(storageKey, on ? 'on' : 'off')
      } catch {
        /* ignore */
      }
      if (on) {
        void audio().resume()
        setUnlocked(true)
        chimes.newTicket()
      }
    },
    [storageKey],
  )

  // Any tap on the page unlocks audio if the user had turned sound on before.
  useEffect(() => {
    if (!enabled || unlocked) return
    const unlock = () => {
      void audio().resume()
      setUnlocked(true)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [enabled, unlocked])

  const play = useCallback(
    (kind: keyof typeof chimes) => {
      if (!enabled) return
      try {
        chimes[kind]()
      } catch {
        /* audio unavailable */
      }
      if ('vibrate' in navigator) navigator.vibrate?.(kind === 'attention' ? [120, 60, 120] : 150)
    },
    [enabled],
  )

  return { enabled, unlocked, enable, play, needsTap: enabled && !unlocked }
}

/**
 * Calls `onNew` with items whose ids were not seen before (after the first
 * load), e.g. to chime when a new ticket arrives. Works with realtime or polling.
 */
export function useNewArrivals<T extends { id: string }>(
  items: T[] | undefined,
  onNew: (fresh: T[]) => void,
) {
  const seen = useRef<Set<string> | null>(null)
  const cb = useRef(onNew)
  useEffect(() => {
    cb.current = onNew
  })
  useEffect(() => {
    if (!items) return
    if (seen.current === null) {
      seen.current = new Set(items.map((i) => i.id))
      return
    }
    const fresh = items.filter((i) => !seen.current!.has(i.id))
    for (const i of items) seen.current.add(i.id)
    if (fresh.length) cb.current(fresh)
  }, [items])
}
