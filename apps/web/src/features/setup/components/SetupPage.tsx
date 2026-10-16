import { Store } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ShopType } from '@pos/api/shop-settings'
import { useCompleteSetup } from '../api'
import { isSetupFormFilled } from '../lib/setup-form'
import { ShopTypeChoice } from './ShopTypeChoice'

/** Shown instead of the login page while nobody has an account: makes the owner and names the shop. */
export function SetupPage() {
  const { t } = useTranslation('setup')
  const [form, setForm] = useState({
    setupCode: '',
    shopName: '',
    branchName: '',
    username: '',
    displayName: '',
    password: '',
    confirm: '',
  })
  const [shopType, setShopType] = useState<ShopType | null>(null)
  const complete = useCompleteSetup()
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value })

  const mismatch = form.confirm !== '' && form.password !== form.confirm
  const isFilled = isSetupFormFilled(form)
  const canSubmit = isFilled && shopType !== null && !complete.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit || shopType === null) return
    const { confirm: _confirm, ...input } = form
    complete.mutate({ ...input, setupCode: input.setupCode.trim(), shopType })
  }

  const field = (
    key: keyof typeof form,
    label: string,
    options: { type?: string; autoFocus?: boolean; hint?: string } = {},
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`setup-${key}`}>{label}</Label>
      <Input
        id={`setup-${key}`}
        className="h-11 text-base"
        type={options.type ?? 'text'}
        value={form[key]}
        onChange={set(key)}
        autoFocus={options.autoFocus}
        autoComplete={key === 'password' || key === 'confirm' ? 'new-password' : 'off'}
        required
      />
      {options.hint && <p className="text-xs text-muted-foreground">{options.hint}</p>}
    </div>
  )

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Store className="size-6" />
          </span>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">{t('codeNote')}</p>
            {field('setupCode', t('setupCode'), { autoFocus: true })}
            {field('shopName', t('shopName'))}
            <ShopTypeChoice value={shopType} onChange={setShopType} />
            {field('branchName', t('branchName'))}
            {field('username', t('username'))}
            {field('displayName', t('displayName'))}
            {field('password', t('password'), { type: 'password', hint: t('passwordHint') })}
            {field('confirm', t('confirm'), { type: 'password' })}
            {mismatch && <p className="text-sm text-destructive">{t('mismatch')}</p>}
            {isFilled && shopType === null && <p className="text-sm text-muted-foreground">{t('shopType.required')}</p>}
            {complete.error && (
              <p role="alert" className="text-sm text-destructive">
                {complete.error.message}
              </p>
            )}
            <Button type="submit" className="h-11 w-full text-base" disabled={!canSubmit}>
              {complete.isPending ? t('submitting') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
