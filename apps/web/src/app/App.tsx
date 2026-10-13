import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router'
import { LoginPage, meQuery, useLogout } from '@/features/auth'
import { clearCart, PosPage } from '@/features/pos'
import { ProductsPage } from '@/features/products'
import { TodayPage } from '@/features/sales'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'

export default function App() {
  const me = useQuery(meQuery)
  const logout = useLogout()

  if (me.isPending) return <p className="p-8 text-muted-foreground">กำลังโหลด…</p>
  if (!me.data) return <LoginPage />

  const isOwner = me.data.role === 'owner'

  return (
    <SidebarProvider>
      {/* The cart belongs to the till, not the account: a new user must not inherit the last one's. */}
      <AppSidebar user={me.data} onLogout={() => logout.mutate(undefined, { onSuccess: clearCart })} />
      <SidebarInset className="h-svh min-w-0 overflow-hidden">
        <Routes>
          <Route index element={<PosPage />} />
          <Route path="today" element={<TodayPage isOwner={isOwner} />} />
          {isOwner && <Route path="products" element={<ProductsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  )
}
