import { describe, expect, it } from 'vitest'
import { change, presetRange, todayIn, ymd } from './dates'

const now = new Date(2026, 10, 21, 15, 30) // 21 Nov 2026, local time

describe('presetRange', () => {
  it('uses local calendar dates', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-11-21', to: '2026-11-21' })
    expect(presetRange('yesterday', now)).toEqual({ from: '2026-11-20', to: '2026-11-20' })
  })
  it('counts the last N days including today', () => {
    expect(presetRange('7d', now)).toEqual({ from: '2026-11-15', to: '2026-11-21' })
    expect(presetRange('30d', now).from).toBe('2026-10-23')
  })
  it('handles month boundaries', () => {
    expect(presetRange('month', now)).toEqual({ from: '2026-11-01', to: '2026-11-21' })
    expect(presetRange('last_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('last_month', new Date(2026, 0, 10))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    })
  })
  it('uses the restaurant time zone for today', () => {
    // 22:35 UTC on 22 Nov is already 03:35 on 23 Nov in Karachi.
    const late = new Date(Date.UTC(2026, 10, 22, 22, 35))
    expect(ymd(todayIn('Asia/Karachi', late))).toBe('2026-11-23')
    expect(ymd(todayIn('America/New_York', late))).toBe('2026-11-22')
    expect(presetRange('today', late, 'Asia/Karachi')).toEqual({
      from: '2026-11-23',
      to: '2026-11-23',
    })
  })
  it('formats dates without UTC shifting', () => {
    expect(ymd(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
  })
})

describe('change', () => {
  it('returns percent change with one decimal', () => {
    expect(change(120, 100)).toBe(20)
    expect(change(90, 120)).toBe(-25)
    expect(change(1, 3)).toBe(-66.7)
  })
  it('has nothing to compare against zero', () => {
    expect(change(100, 0)).toBeNull()
  })
})
