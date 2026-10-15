import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LoginPage, meQuery, useLogout } from '@/features/auth'
import { BranchesPage, useActiveBranch } from '@/features/branches'
import { CategoriesPage } from '@/features/categories'
import { MembersPage, MemberDetailsPage } from '@/features/members'
import { ModifiersPage } from '@/features/modifiers'
import { SetupPage, setupStatusQuery } from '@/features/setup'
import { TablesPage } from '@/features/tables'
import { clearCart, PosPage } from '@/features/pos'
import { ProductsPage } from '@/features/products'
import { TodayPage } from '@/features/sales'
import { ReportsPage } from '@/features/reports'
import { SettingsPage, useSettings } from '@/features/settings'
import { UsersPage } from '@/features/users'
import { ShiftsPage, useRegisterSelectionStore } from '@/features/shifts'
import { AppSidebar } from './AppSidebar'
import { AppSkeleton } from './AppSkeleton'
import { BottomNav } from './BottomNav'
import { applyLocale } from './i18n'

function Shell({ user }: { user: User }) {
  const logout = useLogout()
  const { locale } = useSettings()
  const isOwner = user.role === 'owner'
  const clearRegisterSelection = useRegisterSelectionStore((state) => state.clear)
  // Keeps the remembered branch honest (closed or forbidden ones are dropped) even on pages without a switcher.
  useActiveBranch()

  // The shop chooses the language; follow it as soon as the settings arrive or change.
  useEffect(() => {
    void applyLocale(locale)
  }, [locale])

  return (
    // Tablets start with the icon rail so the till has the room; wide screens start with the labels.
    <SidebarProvider defaultOpen={window.matchMedia('(min-width: 1024px)').matches}>
      {/* The cart belongs to the till, not the account: a new user must not inherit the last one's. */}
      <AppSidebar user={user} onLogout={() => logout.mutate(undefined, { onSuccess: () => { clearCart(); clearRegisterSelection() } })} />
      {/* Room at the bottom for the phone menu, which takes the place of the sidebar there. */}
      <SidebarInset className="h-svh bg-canvas min-w-0 overflow-hidden pb-16 sm:pb-0">
        <Routes>
          <Route index element={<PosPage />} />
          <Route path="today" element={<TodayPage isOwner={isOwner} />} />
          {isOwner && <Route path="reports" element={<ReportsPage />} />}
          {isOwner && <Route path="products" element={<ProductsPage />} />}
          {isOwner && <Route path="categories" element={<CategoriesPage />} />}
          {isOwner && <Route path="modifiers" element={<ModifiersPage />} />}
          {isOwner && <Route path="tables" element={<TablesPage />} />}
          {isOwner && <Route path="branches" element={<BranchesPage />} />}
          {isOwner && <Route path="users" element={<UsersPage />} />}
          {isOwner && <Route path="settings" element={<SettingsPage />} />}
          <Route path="members" element={<MembersPage />} />
          <Route path="members/:id" element={<MemberDetailsPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}

export default function App() {
  const me = useQuery(meQuery)
  const setup = useQuery(setupStatusQuery)

  if (me.isPending || setup.isPending) return <AppSkeleton />
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return setup.data ? <SetupPage /> : <LoginPage />

  return <Shell user={me.data} />
}
