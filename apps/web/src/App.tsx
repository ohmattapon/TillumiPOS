import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes } from 'react-router'
import { AppSidebar } from './components/AppSidebar'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { api, unwrap } from './lib/api'
import { meQuery } from './lib/queries'
import { LoginPage } from './pages/LoginPage'
import { PosPage } from './pages/PosPage'
import { ProductsPage } from './pages/ProductsPage'
import { TodayPage } from './pages/TodayPage'

export default function App() {
  const queryClient = useQueryClient()
  const me = useQuery(meQuery)
  const logout = useMutation({
    mutationFn: () => unwrap(api.auth.logout.post()),
    // Drop every cached query so the next user never sees the previous user's data.
    onSuccess: () => queryClient.clear(),
  })

  if (me.isPending) return <p className="p-8 text-muted-foreground">กำลังโหลด…</p>
  if (!me.data) return <LoginPage />

  const isOwner = me.data.role === 'owner'

  return (
    <SidebarProvider>
      <AppSidebar user={me.data} onLogout={() => logout.mutate()} />
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
