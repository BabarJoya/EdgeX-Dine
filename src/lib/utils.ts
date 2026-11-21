import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Money is stored as integer minor units (paisa / cents) everywhere.
 * Format only at the edge, for display.
 */
export function formatMoney(minor: number, currency = 'PKR', locale = 'en-PK') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'PKR' ? 0 : 2,
    maximumFractionDigits: currency === 'PKR' ? 0 : 2,
  }).format(minor / 100)
}
