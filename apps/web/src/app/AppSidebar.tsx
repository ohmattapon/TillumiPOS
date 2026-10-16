import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  ChartNoAxesCombined,
  CalendarCheck,
  ChefHat,
  ChevronsUpDown,
  LayoutGrid,
  LogOut,
  Package,
  Palette,
  Sun,
  Moon,
  MoonStar,
  Trees,
  Flower2,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  WalletCards,
  BadgePercent,
  Tags,
  UserRound,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { BranchSwitcher, useActiveBranch } from '@/features/branches'
import { clearCart } from '@/features/pos'
import { useRegisterSelectionStore } from '@/features/shifts'
import { LOW_STOCK_THRESHOLD, productsQuery } from '@/features/products'
import { useSettings } from '@/features/settings'
import { themes, useTheme, type Theme } from './theme'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

// Active item reads as a flat mint wash with deep-teal text.
const activeItem =
  'data-[active=true]:bg-accent data-[active=true]:text-accent-foreground'

export function AppSidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useTranslation('app')
  const { pathname } = useLocation()
  const { shopName } = useSettings()
  const { theme, setTheme } = useTheme()
  const { branch, canSwitch } = useActiveBranch()
  const isOwner = user.role === 'owner'
  const products = useQuery(productsQuery({ stockAtMost: LOW_STOCK_THRESHOLD, limit: 1 }))
  const lowStockCount = products.data?.total ?? 0
  const clearRegisterSelection = useRegisterSelectionStore((state) => state.clear)

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: t('groups.sales'),
      items: [
        { to: '/', label: t('nav.sell'), icon: ShoppingCart },
        { to: '/kitchen', label: t('nav.kitchen'), icon: ChefHat },
        { to: '/today', label: t('nav.today'), icon: CalendarCheck },
        ...(isOwner ? [{ to: '/reports', label: t('nav.reports'), icon: ChartNoAxesCombined }] : []),
        { to: '/members', label: t('nav.members'), icon: UserRound },
        { to: '/promotions', label: t('nav.promotions'), icon: BadgePercent },
        { to: '/shifts', label: t('nav.shifts'), icon: WalletCards },
      ],
    },
    ...(isOwner
      ? [
          {
            label: t('groups.manage'),
            items: [
              { to: '/products', label: t('nav.products'), icon: Package, badge: lowStockCount },
              { to: '/categories', label: t('nav.categories'), icon: Tags },
              { to: '/modifiers', label: t('nav.modifiers'), icon: SlidersHorizontal },
              { to: '/tables', label: t('nav.tables'), icon: LayoutGrid },
              { to: '/kitchen-stations', label: t('nav.kitchenStations'), icon: Utensils },
              { to: '/branches', label: t('nav.branches'), icon: Building2 },
              { to: '/users', label: t('nav.users'), icon: Users },
              { to: '/settings', label: t('nav.settings'), icon: Settings },
            ],
          },
        ]
      : []),
  ]

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                {/* The product mark; the shop name beside it is what names the shop, so the image is decorative. */}
                <img src="/logo.png" alt="" className="size-8 shrink-0 object-contain" />
                <span className="truncate text-lg font-semibold">{shopName}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {canSwitch ? (
          <div className="px-2 group-data-[collapsible=icon]:hidden">
            {/* The cart is for the branch it was rung up in, so a switch starts a fresh one. */}
            <BranchSwitcher onSwitched={() => { clearCart(); clearRegisterSelection() }} />
          </div>
        ) : (
          branch &&
          branch.name !== shopName && (
            <p className="truncate px-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {branch.name}
            </p>
          )
        )}
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
                    isActive={pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`))}
                    tooltip={item.label}
                    className={`h-11 ${activeItem}`}
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
                    <span className="truncate text-xs text-muted-foreground">{t(`roles.${user.role}`)}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-48">
                <DropdownMenuLabel className="font-normal text-muted-foreground">@{user.username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette />
                    {t('theme.label')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                      {themes.map((value) => {
                        const Icon = {
                          light: Sun,
                          dark: Moon,
                          midnight: MoonStar,
                          forest: Trees,
                          rose: Flower2,
                        }[value]
                        return (
                          <DropdownMenuRadioItem key={value} value={value}>
                            <Icon />
                            {t(`theme.options.${value}`)}
                          </DropdownMenuRadioItem>
                        )
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
