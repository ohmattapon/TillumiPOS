import { Armchair, CircleAlert, Eye, EyeOff, Package, Receipt, Store, Wallet, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useLogin } from '../api'

/** The shop icon and the product name. On the brand panel the tile is white, so the mark stays visible on teal. */
function BrandMark({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-lg',
          inverted ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
        )}
      >
        <Store className="size-5" />
      </span>
      <span className="text-base font-semibold">EasyPOS</span>
    </div>
  )
}

/** The wide-screen left column: what the till does, in a few lines. Shown from 1024px up. */
function BrandPanel() {
  const { t } = useTranslation('auth')
  const points: { icon: LucideIcon; label: string }[] = [
    { icon: Receipt, label: t('brand.sales') },
    { icon: Package, label: t('brand.stock') },
    { icon: Armchair, label: t('brand.tables') },
    { icon: Wallet, label: t('brand.shifts') },
  ]

  return (
    <aside className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
      <BrandMark inverted />
      <div className="max-w-md space-y-8">
        <p className="text-2xl leading-snug font-semibold">{t('brand.headline')}</p>
        <ul className="divide-y divide-primary-foreground/20 border-y border-primary-foreground/20">
          {points.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 py-3 text-sm">
              <Icon className="size-4 shrink-0" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

export function LoginPage() {
  const { t } = useTranslation('auth')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const login = useLogin()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ username, password })
  }

  return (
    <div className="grid min-h-svh bg-canvas lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <BrandPanel />
      <main className="flex min-h-svh flex-col p-4 sm:p-8">
        <BrandMark className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm space-y-6">
            <section className="rounded-[10px] border bg-card p-6 sm:p-8">
              <h1 className="text-xl font-semibold">{t('title')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">{t('username')}</Label>
                  <Input
                    id="username"
                    className="h-11 text-base"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('password')}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className="h-11 pr-11 text-base"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 size-11 text-muted-foreground"
                      aria-label={t('showPassword')}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>
                {login.error && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    {login.error.message}
                  </p>
                )}
                <Button type="submit" disabled={login.isPending} className="h-11 w-full text-base">
                  {login.isPending ? t('submitting') : t('submit')}
                </Button>
              </form>
            </section>
            <p className="text-center text-xs text-muted-foreground">{t('forgotPassword')}</p>
          </div>
        </div>
      </main>
    </div>
  )
}
