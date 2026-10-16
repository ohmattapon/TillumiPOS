import type { ShopSettings } from '@pos/api/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonPanel } from '@/components/Skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createMoney, type Locale } from '@/lib/money'
import { settingsQuery, useUpdateSettings } from '../api'

// Currencies a Thai shop is likely to meet; the list is a convenience, the API accepts any ISO 4217 code.
const CURRENCIES = ['THB', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'MYR', 'VND', 'IDR', 'PHP', 'KRW', 'LAK', 'KHR', 'MMK']

// Language names are shown in their own language so they can always be found.
const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'th', label: 'ไทย' },
  { value: 'en', label: 'English' },
]

const PAPER_WIDTHS: ShopSettings['receiptPaperMm'][] = [80, 58]

const HOME_VIEWS: ShopSettings['homeView'][] = ['till', 'tables']

const percentFromBp = (bp: number) => String(bp / 100)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'space-y-2 sm:col-span-2' : 'space-y-2'}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SettingsForm({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation('settings')
  const save = useUpdateSettings()

  const [form, setForm] = useState({
    shopName: settings.shopName,
    taxId: settings.taxId ?? '',
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    currency: settings.currency,
    vatMode: settings.vatMode,
    vatRate: percentFromBp(settings.vatRateBp),
    timeZone: settings.timeZone,
    locale: settings.locale,
    receiptPaperMm: settings.receiptPaperMm,
    receiptFooter: settings.receiptFooter ?? '',
    homeView: settings.homeView,
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(settings.timeZone) ? zones : [settings.timeZone, ...zones]
  }, [settings.timeZone])

  const currencyNames = useMemo(() => new Intl.DisplayNames(form.locale, { type: 'currency' }), [form.locale])
  const currencies = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES]

  const rate = Number(form.vatRate)
  const isRateValid = form.vatRate.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 100
  const changes: ShopSettings = {
    shopName: form.shopName.trim(),
    taxId: form.taxId.trim() || null,
    address: form.address.trim() || null,
    phone: form.phone.trim() || null,
    currency: form.currency,
    vatMode: form.vatMode,
    vatRateBp: isRateValid ? Math.round(rate * 100) : settings.vatRateBp,
    timeZone: form.timeZone,
    locale: form.locale,
    receiptPaperMm: form.receiptPaperMm,
    receiptFooter: form.receiptFooter.trim() || null,
    homeView: form.homeView,
    tablesEnabled: settings.tablesEnabled,
    kitchenEnabled: settings.kitchenEnabled,
    modifiersEnabled: settings.modifiersEnabled,
  }
  const isDirty = JSON.stringify(changes) !== JSON.stringify(settings)
  const canSave = isDirty && isRateValid && changes.shopName !== '' && !save.isPending

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    save.mutate(changes, { onSuccess: () => toast.success(t('saved')) })
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
      <Section title={t('shop.title')}>
        <Field label={t('shop.name')} wide>
          <Input
            className="h-10"
            value={form.shopName}
            maxLength={100}
            required
            onChange={(event) => set('shopName', event.target.value)}
          />
        </Field>
        <Field label={t('shop.taxId')}>
          <Input
            className="h-10 tabular-nums"
            value={form.taxId}
            maxLength={20}
            placeholder={t('shop.optional')}
            onChange={(event) => set('taxId', event.target.value)}
          />
        </Field>
        <Field label={t('shop.phone')}>
          <Input
            className="h-10"
            value={form.phone}
            maxLength={30}
            placeholder={t('shop.optional')}
            onChange={(event) => set('phone', event.target.value)}
          />
        </Field>
        <Field label={t('shop.address')} wide>
          <Textarea
            value={form.address}
            maxLength={300}
            placeholder={t('shop.optional')}
            onChange={(event) => set('address', event.target.value)}
          />
        </Field>
        <Field label={t('shop.homeView')} hint={t('shop.homeViewHint')}>
          <Select value={form.homeView} onValueChange={(value) => set('homeView', value as ShopSettings['homeView'])}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOME_VIEWS.map((view) => (
                <SelectItem key={view} value={view}>
                  {t(`shop.homeViews.${view}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title={t('money.title')}>
        <Field label={t('money.currency')} hint={t('money.currencyHint')}>
          <Select value={form.currency} onValueChange={(value) => set('currency', value)}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code} · {currencyNames.of(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('money.preview')}>
          <p className="flex h-10 items-center rounded-lg bg-muted px-3 text-lg font-semibold tabular-nums">
            {createMoney(form.currency, form.locale).format(125_050)}
          </p>
        </Field>
        <Field label={t('money.vatMode')}>
          <Select value={form.vatMode} onValueChange={(value) => set('vatMode', value as ShopSettings['vatMode'])}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['inclusive', 'exclusive', 'none'] as const).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`money.vatModes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('money.vatRate')} hint={form.vatMode !== 'none' && !isRateValid ? t('money.invalidRate') : undefined}>
          <Input
            className="h-10 text-right tabular-nums"
            inputMode="decimal"
            value={form.vatRate}
            disabled={form.vatMode === 'none'}
            aria-invalid={form.vatMode !== 'none' && !isRateValid}
            onChange={(event) => set('vatRate', event.target.value)}
          />
        </Field>
      </Section>

      <Section title={t('region.title')}>
        <Field label={t('region.language')}>
          <Select value={form.locale} onValueChange={(value) => set('locale', value as Locale)}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((language) => (
                <SelectItem key={language.value} value={language.value}>
                  {language.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('region.timeZone')} hint={t('region.timeZoneHint')}>
          <Select value={form.timeZone} onValueChange={(value) => set('timeZone', value)}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeZones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title={t('receipt.title')}>
        <Field label={t('receipt.paper')} hint={t('receipt.paperHint')}>
          <Select
            value={String(form.receiptPaperMm)}
            onValueChange={(value) => set('receiptPaperMm', Number(value) as ShopSettings['receiptPaperMm'])}
          >
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAPER_WIDTHS.map((width) => (
                <SelectItem key={width} value={String(width)}>
                  {t('receipt.paperWidth', { width })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t('receipt.footer')} hint={t('receipt.footerHint')} wide>
          <Textarea
            value={form.receiptFooter}
            maxLength={200}
            placeholder={t('receipt.footerPlaceholder')}
            onChange={(event) => set('receiptFooter', event.target.value)}
          />
        </Field>
      </Section>

      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" className="h-10 px-6" disabled={!canSave}>
          {save.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  )
}

export function SettingsPage() {
  const { t } = useTranslation('settings')
  const settings = useQuery(settingsQuery)

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {settings.error && <p className="text-sm text-destructive">{settings.error.message}</p>}
        {settings.isPending && <SkeletonPanel rows={6} className="mx-auto max-w-3xl" />}
        {/* Keyed by the stored values, so the form starts again from what was saved. */}
        {settings.data && <SettingsForm key={JSON.stringify(settings.data)} settings={settings.data} />}
      </div>
    </>
  )
}
