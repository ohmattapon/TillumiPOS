import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '../api'

/** The TillumiPOS logo, centred at the top of the sign-in card. */
function BrandLogo() {
  const { t } = useTranslation('auth')
  return <img src="/tillumipos-logo.png" alt={t('brand.logoAlt')} className="mx-auto mb-6 block h-16 w-auto" />
}

/** The left half of the floating card: the till photo full-bleed on top, short caption below. Shown from 1024px up. */
function CardImage() {
  const { t } = useTranslation('auth')
  return (
    <div className="hidden flex-col lg:flex">
      <div className="relative min-h-72 flex-1">
        <img src="/login-hero.jpg" alt={t('brand.imageAlt')} loading="lazy" className="absolute inset-0 size-full object-cover" />
      </div>
      <div className="bg-primary p-8 text-primary-foreground">
        <p className="text-xl leading-snug font-semibold">{t('brand.headline')}</p>
      </div>
    </div>
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
    <div className="flex min-h-svh items-center justify-center bg-muted p-4 sm:p-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-[10px] border bg-card lg:grid-cols-2">
        <CardImage />
        <main className="flex items-center justify-center">
          <div className="mx-auto w-full max-w-sm p-6 sm:p-8">
            <BrandLogo />
            <h1 className="text-center text-xl font-semibold">{t('title')}</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">{t('subtitle')}</p>
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
            <p className="mt-6 text-center text-xs text-muted-foreground">{t('forgotPassword')}</p>
          </div>
        </main>
      </div>
    </div>
  )
}
