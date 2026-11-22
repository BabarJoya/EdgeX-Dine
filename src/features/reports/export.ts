import type { SalesReport } from './api'

const methodName: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  wallet: 'Wallet',
  bank_transfer: 'Bank / Raast',
}
const sourceName: Record<string, string> = {
  qr: 'QR menu',
  waiter: 'Waiter',
  pos: 'POS',
  online: 'Online',
}
const rupees = (minor: number) => Math.round(minor) / 100

type Sheet = { name: string; columns: string[]; rows: (string | number | null)[][] }

/** The report as plain tables; both Excel and PDF are built from this. */
export function reportSheets(r: SalesReport): Sheet[] {
  const t = r.totals
  return [
    {
      name: 'Summary',
      columns: ['Measure', 'This period', 'Previous period'],
      rows: [
        ['Net sales (before tax)', rupees(t.net_sales_minor), rupees(t.prev_net_sales_minor)],
        ['Tax collected', rupees(t.tax_minor), null],
        ['Total collected (incl. tax)', rupees(t.collected_minor), null],
        ['Paid bills', t.bills, t.prev_bills],
        ['Average bill', rupees(t.avg_bill_minor), rupees(t.prev_avg_bill_minor)],
        ['Orders', t.orders, t.prev_orders],
        ['Cancelled orders', t.cancelled_orders, null],
        ['Discounts', rupees(t.discounts_minor), null],
        ['Refunds', rupees(t.refunds_minor), null],
      ],
    },
    {
      name: 'By day',
      columns: ['Date', 'Net sales', 'Orders'],
      rows: r.daily.map((d) => [d.date, rupees(d.net_sales_minor), d.orders]),
    },
    {
      name: 'By hour',
      columns: ['Hour', 'Orders'],
      rows: r.hourly.map((h) => [`${String(h.hour).padStart(2, '0')}:00`, h.orders]),
    },
    {
      name: 'Items',
      columns: ['Item', 'Quantity', 'Revenue'],
      rows: r.top_items.map((i) => [i.name, i.quantity, rupees(i.revenue_minor)]),
    },
    {
      name: 'Categories',
      columns: ['Category', 'Quantity', 'Revenue'],
      rows: r.categories.map((c) => [c.name, c.quantity, rupees(c.revenue_minor)]),
    },
    {
      name: 'Payments',
      columns: ['Method', 'Payments', 'Amount (incl. tax)', 'Tax'],
      rows: r.payment_methods.map((p) => [
        methodName[p.method] ?? p.method,
        p.payments,
        rupees(p.amount_minor),
        rupees(p.tax_minor),
      ]),
    },
    {
      name: 'Sources',
      columns: ['Source', 'Type', 'Orders', 'Value'],
      rows: r.sources.map((s) => [
        sourceName[s.source] ?? s.source,
        s.type.replace('_', '-'),
        s.orders,
        rupees(s.value_minor),
      ]),
    },
    {
      name: 'Branches',
      columns: ['Branch', 'Net sales', 'Orders'],
      rows: r.branches.map((b) => [b.name, rupees(b.net_sales_minor), b.orders]),
    },
    {
      name: 'Staff',
      columns: [
        'Name',
        'Net sales taken',
        'Payments',
        'Orders taken',
        'Requests handled',
        'Avg response (s)',
      ],
      rows: r.staff.map((s) => [
        s.name || s.email,
        rupees(s.net_sales_minor),
        s.payments,
        s.orders_taken,
        s.requests_handled,
        s.avg_response_seconds,
      ]),
    },
    {
      name: 'Kitchen',
      columns: [
        'Station',
        'Tickets',
        'Avg cooking (min)',
        'Avg order to ready (min)',
        'Over 20 min',
      ],
      rows: r.kitchen.map((k) => [
        k.station,
        k.tickets,
        k.avg_cook_minutes,
        k.avg_total_minutes,
        k.over_20_minutes,
      ]),
    },
  ]
}

function filename(
  meta: { restaurant: string; branch: string; from: string; to: string },
  ext: string,
) {
  const safe = (s: string) =>
    s
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
  return `${safe(meta.restaurant)}-${safe(meta.branch)}-${meta.from}_to_${meta.to}.${ext}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportExcel(
  r: SalesReport,
  meta: { restaurant: string; branch: string; from: string; to: string },
) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EdgeX Restaurant ERP'
  for (const sheet of reportSheets(r)) {
    const ws = wb.addWorksheet(sheet.name)
    ws.addRow([
      `${meta.restaurant} · ${meta.branch} · ${meta.from} to ${meta.to} · amounts in ${r.currency}`,
    ]).font = { italic: true, size: 9 }
    const header = ws.addRow(sheet.columns)
    header.font = { bold: true }
    sheet.rows.forEach((row) => ws.addRow(row))
    ws.columns.forEach((c, i) => (c.width = i === 0 ? 28 : 16))
    ws.views = [{ state: 'frozen', ySplit: 2 }]
  }
  const buf = await wb.xlsx.writeBuffer()
  download(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename(meta, 'xlsx'),
  )
}

export async function exportPdf(
  r: SalesReport,
  meta: { restaurant: string; branch: string; from: string; to: string },
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.setFontSize(16)
  doc.text(`${meta.restaurant} — sales report`, 40, 48)
  doc.setFontSize(10)
  doc.setTextColor(98, 102, 111)
  doc.text(`${meta.branch} · ${meta.from} to ${meta.to} · amounts in ${r.currency}`, 40, 66)
  let y = 92
  for (const sheet of reportSheets(r)) {
    if (sheet.rows.length === 0) continue
    if (y > 760) {
      doc.addPage()
      y = 48
    }
    doc.setFontSize(12)
    doc.setTextColor(28, 31, 36)
    doc.text(sheet.name, 40, y)
    autoTable(doc, {
      startY: y + 8,
      head: [sheet.columns],
      body: sheet.rows.map((row) =>
        row.map((v) => (v === null ? '—' : typeof v === 'number' ? v.toLocaleString() : v)),
      ),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, lineColor: [227, 224, 217] },
      headStyles: { fillColor: [19, 35, 63], textColor: 255 },
      margin: { left: 40, right: 40 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 32
  }
  doc.save(filename(meta, 'pdf'))
}
