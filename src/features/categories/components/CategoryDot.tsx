import { cn } from '@/lib/utils'
import { categoryColor } from '../lib/category-color'

/** Small round mark in a category's colour, shown before its name so the eye finds it before reading. */
export function CategoryDot({ categoryId, className }: { categoryId: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: categoryColor(categoryId) }}
    />
  )
}
