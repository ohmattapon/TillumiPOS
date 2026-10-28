import type { User } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import {
  Armchair,
  ChartNoAxesCombined,
  CalendarCheck,
  ChevronDown,
  ChevronsUpDown,
  Database,
  LayoutGrid,
  KeyRound,
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
  Store,
  WalletCards,
  MonitorPlay,
  BadgePercent,
  Tags,
  UserRound,
  Users,
  History,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { LOW_STOCK_THRESHOLD, productsQuery } from '@/features/products'
import { useFeatures, useSettings } from '@/features/settings'
import { OwnPinDialog, useAuthorization } from '@/features/auth'
import { cn } from '@/lib/utils'
import { themes, useTheme, type Theme } from './theme'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: number
}

interface NavGroup {
  key: 'sales' | 'manage'
  label: string
  icon: LucideIcon
  items: NavItem[]
}

// Active item reads as a flat mint wash with deep-teal text. Hover is a quieter neutral wash, so pointing at a row never
// looks like the page you are on; the active row keeps its mint while hovered.
const activeItem =
  'transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:hover:bg-accent data-[active=true]:hover:text-accent-foreground'

export function AppSidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useTranslation('app')
  const { t: ta } = useTranslation('auth')
  const { pathname } = useLocation()
  const { shopName, homeView } = useSettings()
  const { theme, setTheme } = useTheme()
  const { can, user: currentUser } = useAuthorization()
  const features = useFeatures()
  const [pinOpen, setPinOpen] = useState(false)
  const products = useQuery(productsQuery({ stockAtMost: LOW_STOCK_THRESHOLD, limit: 1 }))
  const lowStockCount = products.data?.total ?? 0
  const { state } = useSidebar()
  // A folded sidebar shows every item as an icon, so a group is only collapsible while it shows its labels.
  const iconMode = state === 'collapsed'
  const [chosenOpen, setChosenOpen] = useState<Record<string, boolean>>({})

  const groups: NavGroup[] = [
    {
      key: 'sales',
      label: t('groups.sales'),
      icon: Store,
      items: [
        // With the floor as home the till moves to /sell, and the floor takes its place at the top.
        ...(homeView === 'tables'
          ? [
              { to: '/', label: t('nav.floor'), icon: Armchair },
              { to: '/sell', label: t('nav.sell'), icon: ShoppingCart },
            ]
          : [{ to: '/', label: t('nav.sell'), icon: ShoppingCart }]),
        { to: '/today', label: t('nav.today'), icon: CalendarCheck },
        ...(can('reports.read') ? [{ to: '/reports', label: t('nav.reports'), icon: ChartNoAxesCombined }] : []),
        { to: '/members', label: t('nav.members'), icon: UserRound },
        { to: '/promotions', label: t('nav.promotions'), icon: BadgePercent },
        ...(can('promotions.write') ? [{ to: '/display-slides', label: t('nav.displaySlides'), icon: MonitorPlay }] : []),
        { to: '/shifts', label: t('nav.shifts'), icon: WalletCards },
      ],
    },
    {
      key: 'manage',
      label: t('groups.manage'),
      icon: Database,
      items: [
        ...((can('products.write') || can('inventory.receive') || can('inventory.adjust')) ? [{ to: '/products', label: t('nav.products'), icon: Package, badge: lowStockCount }] : []),
        ...(can('inventory.receive') ? [{ to: '/stock-receipts', label: t('nav.stockReceipts'), icon: Package }] : []),
        ...(can('categories.write') ? [{ to: '/categories', label: t('nav.categories'), icon: Tags }] : []),
        ...(features.modifiers && can('modifiers.write') ? [{ to: '/modifiers', label: t('nav.modifiers'), icon: SlidersHorizontal }] : []),
        ...(features.tables && can('tables.write') ? [{ to: '/tables', label: t('nav.tables'), icon: LayoutGrid }] : []),
        ...((can('users.manage') || can('roles.manage')) ? [{ to: '/users', label: t('nav.users'), icon: Users }] : []),
        ...(can('settings.write') ? [{ to: '/settings', label: t('nav.settings'), icon: Settings }] : []),
        ...(can('audit.read') ? [{ to: '/audit', label: t('nav.audit'), icon: History }] : []),
      ],
    },
  ]

  const isGroupOpen = (group: NavGroup) =>
    iconMode ||
    (chosenOpen[group.key] ??
      group.items.some((item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`))))

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
      </SidebarHeader>

      <SidebarContent>
        {groups.filter((group) => group.items.length > 0).map((group) => {
          const open = isGroupOpen(group)
          const hasActive = group.items.some(
            (item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)),
          )
          return (
            <SidebarGroup key={group.key}>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  {/* A group has no page of its own, so its row only folds and unfolds the items under it. */}
                  <SidebarMenuButton
                    type="button"
                    onClick={() => setChosenOpen((previous) => ({ ...previous, [group.key]: !open }))}
                    aria-expanded={open}
                    aria-controls={`nav-group-${group.key}`}
                    tooltip={group.label}
                    className={cn('h-11', !hasActive && 'text-muted-foreground')}
                  >
                    <group.icon />
                    <span>{group.label}</span>
                    {!iconMode && (
                      <ChevronDown className={cn('ml-auto size-4 transition-transform', open && 'rotate-180')} />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {open && (
                  <SidebarMenuItem>
                    <SidebarMenu id={`nav-group-${group.key}`} className={cn('gap-1', !iconMode && 'ml-3 border-l pl-2')}>
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
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroup>
          )
        })}
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
                    <span className="truncate text-xs text-muted-foreground">{currentUser?.roleName ?? t(`roles.${user.role}`)}</span>
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
                <DropdownMenuItem onSelect={() => setPinOpen(true)}>
                  <KeyRound />
                  {ta('pin.setOwn')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {pinOpen && <OwnPinDialog hasPin={currentUser?.hasPin ?? false} onClose={() => setPinOpen(false)} />}
    </Sidebar>
  )
}
