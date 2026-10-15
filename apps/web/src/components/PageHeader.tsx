import type { ReactNode } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'

interface Props {
  title: string
  /** Shown after the title in the accent colour. */
  highlight?: string
  description?: string
  /** Faint trail above the title, e.g. "จัดการ / สินค้า". */
  breadcrumb?: ReactNode
  children?: ReactNode
}

export function PageHeader({ title, highlight, description, breadcrumb, children }: Props) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b bg-background px-4 print:hidden">
      {/* Phones use the bottom menu instead of this button. */}
      <SidebarTrigger className="hidden size-11 text-muted-foreground sm:inline-flex" />
      <div className="min-w-0">
        {breadcrumb && <p className="truncate text-xs text-muted-foreground">{breadcrumb}</p>}
        <h1 className="line-clamp-2 text-base font-semibold sm:truncate">
          {title}
          {highlight && (
            <>
              {' · '}
              <span className="text-primary">{highlight}</span>
            </>
          )}
        </h1>
        {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>
    </header>
  )
}
