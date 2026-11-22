/**
 * Minimal ESC/POS encoder for 58 mm (32 columns) and 80 mm (48 columns)
 * thermal printers. Text is printed in the printer's default code page, so
 * only ASCII is sent; other characters (e.g. Urdu) become '?'. Item names on
 * tickets use the English name for that reason.
 */
const ESC = 0x1b
const GS = 0x1d

export type Align = 'left' | 'center' | 'right'

export class EscPos {
  private bytes: number[] = []
  readonly columns: number

  constructor(columns: 32 | 48 = 48) {
    this.columns = columns
    this.raw(ESC, 0x40) // initialise
  }

  raw(...b: number[]) {
    this.bytes.push(...b)
    return this
  }

  text(s: string) {
    const plain = s
      .replace(/[\u2212\u2013\u2014]/g, '-')
      .replace(/\u00d7/g, 'x')
      .replace(/\u00b7/g, '-')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2026/g, '...')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
    for (const ch of plain) {
      const c = ch.charCodeAt(0)
      this.bytes.push(c >= 0x20 && c < 0x7f ? c : c === 0x0a ? 0x0a : 0x3f)
    }
    return this
  }

  line(s = '') {
    return this.text(s).raw(0x0a)
  }

  align(a: Align) {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2)
  }

  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0)
  }

  /** 1 = normal, 2 = double width and height. */
  size(n: 1 | 2) {
    return this.raw(GS, 0x21, n === 2 ? 0x11 : 0x00)
  }

  rule(ch = '-') {
    return this.line(ch.repeat(this.columns))
  }

  /** Left and right text on one line (left side wraps if too long). */
  row(left: string, right: string, columns = this.columns) {
    const room = Math.max(1, columns - right.length - 1)
    const words = wrap(left, room)
    words.forEach((w, i) => this.line(i === words.length - 1 ? w.padEnd(room) + ' ' + right : w))
    return this
  }

  qr(data: string, size = 6) {
    const d = [...new TextEncoder().encode(data)]
    const len = d.length + 3
    return this.raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // model 2
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size)
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31) // error correction M
      .raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...d)
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
  }

  feed(lines = 3) {
    return this.raw(ESC, 0x64, lines)
  }

  cut() {
    return this.feed(3).raw(GS, 0x56, 0x42, 0x00)
  }

  /** Pulse the cash drawer connected to the printer. */
  drawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa)
  }

  encode() {
    return new Uint8Array(this.bytes)
  }
}

export function wrap(s: string, width: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of s.split(/\s+/).filter(Boolean)) {
    if (word.length > width) {
      if (cur) out.push(cur)
      for (let i = 0; i < word.length; i += width) out.push(word.slice(i, i + width))
      cur = out.pop() ?? ''
      continue
    }
    if (!cur) cur = word
    else if (cur.length + 1 + word.length <= width) cur += ' ' + word
    else {
      out.push(cur)
      cur = word
    }
  }
  out.push(cur)
  return out
}
