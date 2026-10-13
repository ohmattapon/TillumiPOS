import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

export type Tone = keyof typeof tones

/** Tinted pill with a leading status dot. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
