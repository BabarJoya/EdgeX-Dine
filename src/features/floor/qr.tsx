import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/** QR code rendered as inline SVG (crisp when printed at any size). */
export function QrSvg({
  value,
  className,
  label,
}: {
  value: string
  className?: string
  label: string
}) {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#13233F', light: '#FFFFFF' },
    }).then((s) => alive && setSvg(s))
    return () => {
      alive = false
    }
  }, [value])
  if (!svg) return <div className={className} aria-busy="true" />
  // The SVG string comes from the qrcode library, not from user input.
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
