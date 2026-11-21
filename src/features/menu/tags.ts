export const TAGS = [
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
  { value: 'spicy', label: 'Spicy' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'gluten_free', label: 'Gluten free' },
] as const

export const tagLabel = (v: string) => TAGS.find((t) => t.value === v)?.label ?? v
