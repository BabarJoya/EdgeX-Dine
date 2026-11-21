export type Lang = 'en' | 'ur'

const en = {
  search: 'Search the menu',
  all: 'All',
  soldOut: 'Sold out',
  from: 'from',
  addToOrder: 'Add to order',
  add: 'Add',
  size: 'Size',
  required: 'Required',
  optional: 'Optional',
  chooseOne: 'Choose 1',
  chooseUpTo: (n: number) => `Choose up to ${n}`,
  chooseRange: (a: number, b: number) => (a === b ? `Choose ${a}` : `Choose ${a}–${b}`),
  specialInstructions: 'Special instructions',
  instructionsPlaceholder: 'e.g. less spicy, no onions',
  viewOrder: 'View order',
  items: (n: number) => (n === 1 ? '1 item' : `${n} items`),
  yourOrder: 'Your order',
  orderNotes: 'Note for the kitchen',
  placeOrder: 'Place order',
  placing: 'Sending…',
  emptyCart: 'Your order is empty',
  subtotal: 'Subtotal',
  taxesNote: 'Taxes and service charges, if any, are added to the final bill.',
  orderSent: (n: number) => `Order #${n} sent to the kitchen`,
  myOrders: 'My orders',
  menu: 'Menu',
  noOrders: "You haven't ordered yet.",
  order: 'Order',
  total: 'Total',
  service: 'Need anything?',
  callWaiter: 'Call waiter',
  water: 'Water',
  napkins: 'Napkins',
  bill: 'Ask for the bill',
  requestSent: 'Your waiter has been notified',
  alreadyRequested: 'Already requested, your waiter is on the way',
  browseOnly: 'To order, scan the QR code on your table.',
  closed: 'This table has been closed. Thank you for visiting!',
  table: 'Table',
  status: {
    new: 'Sent',
    accepted: 'Accepted',
    preparing: 'Being prepared',
    ready: 'Ready',
    served: 'Served',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  noResults: 'No matching dishes',
  notFound: 'Menu not found',
  badTable: 'This QR code is not valid. Please ask your waiter.',
  language: 'اردو',
}

const ur: typeof en = {
  search: 'مینو میں تلاش کریں',
  all: 'سب',
  soldOut: 'ختم',
  from: 'سے شروع',
  addToOrder: 'آرڈر میں شامل کریں',
  add: 'شامل کریں',
  size: 'سائز',
  required: 'ضروری',
  optional: 'اختیاری',
  chooseOne: 'ایک منتخب کریں',
  chooseUpTo: (n) => `زیادہ سے زیادہ ${n} منتخب کریں`,
  chooseRange: (a, b) => (a === b ? `${a} منتخب کریں` : `${a} سے ${b} منتخب کریں`),
  specialInstructions: 'خصوصی ہدایات',
  instructionsPlaceholder: 'مثلاً کم مرچ، پیاز کے بغیر',
  viewOrder: 'آرڈر دیکھیں',
  items: (n) => `${n} آئٹم`,
  yourOrder: 'آپ کا آرڈر',
  orderNotes: 'کچن کے لیے نوٹ',
  placeOrder: 'آرڈر بھیجیں',
  placing: 'بھیجا جا رہا ہے…',
  emptyCart: 'آپ کا آرڈر خالی ہے',
  subtotal: 'ذیلی کل',
  taxesNote: 'ٹیکس اور سروس چارجز، اگر ہوں، آخری بل میں شامل ہوں گے۔',
  orderSent: (n) => `آرڈر نمبر ${n} کچن کو بھیج دیا گیا`,
  myOrders: 'میرے آرڈر',
  menu: 'مینو',
  noOrders: 'آپ نے ابھی تک آرڈر نہیں کیا۔',
  order: 'آرڈر',
  total: 'کل',
  service: 'کچھ چاہیے؟',
  callWaiter: 'ویٹر کو بلائیں',
  water: 'پانی',
  napkins: 'ٹشو',
  bill: 'بل منگوائیں',
  requestSent: 'ویٹر کو اطلاع دے دی گئی ہے',
  alreadyRequested: 'درخواست پہلے ہی بھیج دی گئی ہے، ویٹر آ رہا ہے',
  browseOnly: 'آرڈر کرنے کے لیے اپنی میز پر موجود QR کوڈ اسکین کریں۔',
  closed: 'یہ میز بند کر دی گئی ہے۔ تشریف لانے کا شکریہ!',
  table: 'میز',
  status: {
    new: 'بھیج دیا گیا',
    accepted: 'قبول',
    preparing: 'تیار ہو رہا ہے',
    ready: 'تیار ہے',
    served: 'پیش کر دیا گیا',
    completed: 'مکمل',
    cancelled: 'منسوخ',
  },
  noResults: 'کوئی ڈش نہیں ملی',
  notFound: 'مینو نہیں ملا',
  badTable: 'یہ QR کوڈ درست نہیں۔ براہ کرم ویٹر سے رابطہ کریں۔',
  language: 'English',
}

export const strings = { en, ur }
export type Strings = typeof en

/** Translated field with English fallback. */
export function tr(
  lang: Lang,
  value: {
    name: string
    description?: string
    translations?: Partial<Record<string, { name?: string; description?: string }>>
  },
  field: 'name' | 'description' = 'name',
) {
  if (lang !== 'en') {
    const t = value.translations?.[lang]?.[field]
    if (t) return t
  }
  return field === 'name' ? value.name : (value.description ?? '')
}

/** Like tr(), but also returns the language actually used (for lang/font). */
export function trl(
  lang: Lang,
  value: {
    name: string
    description?: string
    translations?: Partial<Record<string, { name?: string; description?: string }>>
  },
  field: 'name' | 'description' = 'name',
): [string, Lang] {
  if (lang !== 'en') {
    const t = value.translations?.[lang]?.[field]
    if (t) return [t, lang]
  }
  return [field === 'name' ? value.name : (value.description ?? ''), 'en']
}
