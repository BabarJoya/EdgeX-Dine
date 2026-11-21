import { supabase } from './supabase'

export const MENU_BUCKET = 'menu-images'

/** Public URL for a stored menu image path. */
export function menuImageUrl(path: string | null | undefined) {
  if (!path) return null
  return supabase.storage.from(MENU_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Resize in the browser (max 1200px, WebP) before upload: phone photos are
 * often 4–8 MB, guests on mobile data should download ~100 KB.
 */
export async function resizeImage(file: File, max = 1200, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP).')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  )
  if (!blob) throw new Error('Could not process this image.')
  return blob
}

export async function uploadMenuImage(
  tenantId: string,
  kind: 'products' | 'categories',
  file: File,
) {
  const blob = await resizeImage(file)
  const path = `${tenantId}/${kind}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from(MENU_BUCKET)
    .upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return path
}

export async function deleteMenuImage(path: string) {
  await supabase.storage.from(MENU_BUCKET).remove([path])
}
