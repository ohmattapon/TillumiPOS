/** The 5 MB ceiling mirrors the server rule in `slide-schemas.ts`; the server decides again on upload. */
export const MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024

export const ACCEPTED_SLIDE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type SlideFileError = 'type' | 'size'

interface SlideFile {
  type: string
  size: number
}

/** Rejects picked files before they are uploaded; the server still validates with the same limits. */
export function validateSlideFile(file: SlideFile): SlideFileError | null {
  if (!(ACCEPTED_SLIDE_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > MAX_SLIDE_IMAGE_BYTES) return 'size'
  return null
}

interface Ordered {
  id: number
  sortOrder: number
}

/** Lowest number first, lowest id on ties; returns a copy so the cached list keeps its order. */
export function sortSlides<T extends Ordered>(slides: readonly T[]): T[] {
  return [...slides].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

/** Where an uploaded slide lands: after the highest order in use (the server appends the same way). */
export function nextSortOrder(slides: readonly { sortOrder: number }[]): number {
  return slides.reduce((max, slide) => Math.max(max, slide.sortOrder), -1) + 1
}
