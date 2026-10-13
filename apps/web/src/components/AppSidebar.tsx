import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, ChevronsUpDown, LogOut, Package, ShoppingCart, Store, UserRound, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { LOW_STOCK_THRESHOLD, productsQuery } from '@/lib/queries'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

const roleLabel = { owner: 'เจ้าของร้าน', cashier: 'แคชเชียร์' } as const

// Active item reads as a raised white card with accent-coloured text.
const activeItem =
  'data-[active=true]:bg-background data-[active=true]:text-primary data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-border'

export function AppSidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { pathname } = useLocation()
  const isOwner = user.role === 'owner'
  const products = useQuery(productsQuery())
  const lowStockCount =
    products.data?.filter((product) => product.trackStock && product.stockQty <= LOW_STOCK_THRESHOLD).length ?? 0

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: 'งานขาย',
      items: [
        { to: '/', label: 'ขายสินค้า', icon: ShoppingCart },
        { to: '/today', label: 'วันนี้', icon: CalendarCheck },
      ],
    },
    ...(isOwner
      ? [{ label: 'จัดการ', items: [{ to: '/products', label: 'สินค้าและสต็อก', icon: Package, badge: lowStockCount }] }]
      : []),
  ]

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Store className="size-4" />
                </span>
                <span className="text-lg font-semibold">EasyPOS</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] tracking-wider uppercase">{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.to}
                    tooltip={item.label}
                    className={`h-9 ${activeItem}`}
                  >
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                  {!!item.badge && (
                    <SidebarMenuBadge className="rounded-full bg-primary/10 px-1.5 text-primary">
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <span className="flex aspect-square size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="size-4" />
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user.displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel[user.role]}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-48">
                <DropdownMenuLabel className="font-normal text-muted-foreground">@{user.username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut />
                  ออกจากระบบ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
