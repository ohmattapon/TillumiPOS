import { CalendarCheck, Menu, ShoppingCart, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

/** Phones only: the three pages a cashier lives in, and the rest of the menu behind the fourth button. */
export function BottomNav() {
  const { t } = useTranslation('app')
  const { setOpenMobile } = useSidebar()
  const item = 'flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs'
  const link = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-primary' : 'text-muted-foreground')

  return (
    <nav
      aria-label={t('nav.bottom')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden"
    >
      <NavLink to="/" end className={link}>
        <ShoppingCart className="size-5" />
        <span className="max-w-full truncate">{t('nav.sell')}</span>
      </NavLink>
      <NavLink to="/today" className={link}>
        <CalendarCheck className="size-5" />
        <span className="max-w-full truncate">{t('nav.today')}</span>
      </NavLink>
      <NavLink to="/shifts" className={link}>
        <WalletCards className="size-5" />
        <span className="max-w-full truncate">{t('nav.shifts')}</span>
      </NavLink>
      <button type="button" className={cn(item, 'text-muted-foreground')} onClick={() => setOpenMobile(true)}>
        <Menu className="size-5" />
        <span className="max-w-full truncate">{t('nav.more')}</span>
      </button>
    </nav>
  )
}
