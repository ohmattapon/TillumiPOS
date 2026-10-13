import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LoginPage, meQuery, useLogout } from '@/features/auth'
import { BranchesPage, useActiveBranch } from '@/features/branches'
import { clearCart, PosPage } from '@/features/pos'
import { ProductsPage } from '@/features/products'
import { TodayPage } from '@/features/sales'
import { SettingsPage, useSettings } from '@/features/settings'
import { AppSidebar } from './AppSidebar'
import { applyLocale } from './i18n'

function Shell({ user }: { user: User }) {
  const logout = useLogout()
  const { locale } = useSettings()
  const isOwner = user.role === 'owner'
  // Keeps the remembered branch honest (closed or forbidden ones are dropped) even on pages without a switcher.
  useActiveBranch()

  // The shop chooses the language; follow it as soon as the settings arrive or change.
  useEffect(() => {
    void applyLocale(locale)
  }, [locale])

  return (
    <SidebarProvider>
      {/* The cart belongs to the till, not the account: a new user must not inherit the last one's. */}
      <AppSidebar user={user} onLogout={() => logout.mutate(undefined, { onSuccess: clearCart })} />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <Routes>
          <Route index element={<PosPage />} />
          <Route path="today" element={<TodayPage isOwner={isOwner} />} />
          {isOwner && <Route path="products" element={<ProductsPage />} />}
          {isOwner && <Route path="branches" element={<BranchesPage />} />}
          {isOwner && <Route path="settings" element={<SettingsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  const { t } = useTranslation()
  const me = useQuery(meQuery)

  if (me.isPending) return <p className="p-8 text-muted-foreground">{t('loading')}</p>
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return <LoginPage />

  return <Shell user={me.data} />
}
