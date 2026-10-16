import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { LoginPage, meQuery, useLogout, useAuthorization } from '@/features/auth'
import { RolesPage } from '@/features/roles'
import { AuditPage } from '@/features/audit'
import { BranchesPage, useActiveBranch } from '@/features/branches'
import { CategoriesPage } from '@/features/categories'
import { KitchenBoardPage, KitchenStationsPage } from '@/features/kitchen'
import { CustomerDisplayPage, isCustomerScreenPath } from '@/features/customer-display'
import { MembersPage, MemberDetailsPage } from '@/features/members'
import { PromotionsPage } from '@/features/promotions'
import { ModifiersPage } from '@/features/modifiers'
import { SetupPage, setupStatusQuery } from '@/features/setup'
import { TablesPage } from '@/features/tables'
import { clearCart, FloorPage, PosPage } from '@/features/pos'
import { ProductsPage } from '@/features/products'
import { TodayPage } from '@/features/sales'
import { ReportsPage } from '@/features/reports'
import { SettingsPage, useFeatures, useSettings } from '@/features/settings'
import { UsersPage } from '@/features/users'
import { ShiftsPage, useRegisterSelectionStore } from '@/features/shifts'
import { AppSidebar } from './AppSidebar'
import { AppSkeleton } from './AppSkeleton'
import { BottomNav } from './BottomNav'
import { applyLocale } from './i18n'

function Shell({ user }: { user: User }) {
  const logout = useLogout()
  const { locale, homeView } = useSettings()
  const { can } = useAuthorization()
  const features = useFeatures()
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
          <Route index element={homeView === 'tables' ? <FloorPage /> : <PosPage />} />
          <Route path="sell" element={<PosPage />} />
          <Route path="today" element={<TodayPage isOwner={can('reports.read')} />} />
          {can('reports.read') && <Route path="reports" element={<ReportsPage />} />}
          {(can('products.write') || can('inventory.receive') || can('inventory.adjust')) && <Route path="products" element={<ProductsPage />} />}
          {can('categories.write') && <Route path="categories" element={<CategoriesPage />} />}
          {features.modifiers && can('modifiers.write') && <Route path="modifiers" element={<ModifiersPage />} />}
          {features.tables && can('tables.write') && <Route path="tables" element={<TablesPage />} />}
          {can('branches.manage') && <Route path="branches" element={<BranchesPage />} />}
          {can('users.manage') && <Route path="users" element={<UsersPage />} />}
          {can('settings.write') && <Route path="settings" element={<SettingsPage />} />}
          {can('roles.manage') && <Route path="roles" element={<RolesPage />} />}
          {can('audit.read') && <Route path="audit" element={<AuditPage />} />}
          <Route path="members" element={<MembersPage />} />
          <Route path="members/:id" element={<MemberDetailsPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          {features.kitchen && <Route path="kitchen" element={<KitchenBoardPage />} />}
          {features.kitchen && can('kitchen.write') && <Route path="kitchen-stations" element={<KitchenStationsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  )
}

function Gate() {
  const me = useQuery(meQuery)
  const setup = useQuery(setupStatusQuery)

  if (me.isPending || setup.isPending) return <AppSkeleton />
  // Settings need a session, so they are only requested once someone is signed in.
  if (!me.data) return setup.data ? <SetupPage /> : <LoginPage />

  return <Shell user={me.data} />
}

export default function App() {
  const { pathname } = useLocation()
  // The customer's screen shows only what the till sends it over the browser channel, so it needs no
  // sign-in and asks the server for nothing: it must also work when the cashier's session has expired.
  if (isCustomerScreenPath(pathname)) return <CustomerDisplayPage />
  return <Gate />
}
