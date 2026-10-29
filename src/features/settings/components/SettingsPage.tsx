import type { ShopSettings } from '@pos/api/types'
import { pointsDiscountSatang, pointsEarned, type PointsRule } from '@pos/api/points'
import { PROMPTPAY_MODES } from '@pos/api/shop-settings'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonPanel } from '@/components/Skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createMoney, type Locale } from '@/lib/money'
import { settingsQuery, useUpdateSettings } from '../api'
import { ConnectDevicesPanel } from './ConnectDevicesPanel'
import { ReceiptLogoField } from './ReceiptLogoField'
import { UpdatePanel } from './UpdatePanel'
import { withTablesSwitch } from '../lib/feature-switches'
import { canSavePromptPay, normalizePromptPayTarget } from '../lib/promptpay'
import { currencyNameIn, timeZoneOptions } from '../lib/shop-options'

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

function FeatureSwitch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 sm:col-span-2">
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch className="mt-1" checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

function SettingsForm({ settings }: { settings: ShopSettings }) {
  const { t } = useTranslation('settings')
  const save = useUpdateSettings()
  // The rule is stored in minor units, so the form reads and writes it through the shop's currency.
  const settingsMoney = createMoney(settings.currency, settings.locale)

  const [form, setForm] = useState(() => ({
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
    receiptPrinterIp: settings.receiptPrinterIp ?? '',
    receiptPrinterPort: String(settings.receiptPrinterPort),
    receiptPrinterEnabled: settings.receiptPrinterEnabled,
    cashDrawerEnabled: settings.cashDrawerEnabled,
    homeView: settings.homeView,
    tablesEnabled: settings.tablesEnabled,
    modifiersEnabled: settings.modifiersEnabled,
    promptpayMode: settings.promptpayMode,
    promptpayTarget: settings.promptpayTarget ?? '',
    pointsEnabled: settings.pointsEnabled,
    pointsEarn: settingsMoney.toInput(settings.pointsEarnSatang),
    pointsRedeem: settingsMoney.toInput(settings.pointsRedeemSatang),
    pointsMinRedeem: String(settings.pointsMinRedeem),
  }))
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

  const timeZones = useMemo(() => timeZoneOptions(settings.timeZone), [settings.timeZone])
  const currencyName = useMemo(() => currencyNameIn(form.locale), [form.locale])
  const currencies = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES]

  const rate = Number(form.vatRate)
  const isRateValid = form.vatRate.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 100
  const isPromptPayValid = canSavePromptPay(form.promptpayMode, form.promptpayTarget)
  // The form is shown in the shop's currency; the rule itself is kept in minor units.
  const money = useMemo(() => createMoney(form.currency, form.locale), [form.currency, form.locale])
  const earnSatang = money.parse(form.pointsEarn)
  const redeemSatang = money.parse(form.pointsRedeem)
  const minRedeem = Number(form.pointsMinRedeem)
  const isPointsValid =
    earnSatang !== null &&
    earnSatang >= 100 &&
    redeemSatang !== null &&
    redeemSatang >= 1 &&
    form.pointsMinRedeem.trim() !== '' &&
    Number.isInteger(minRedeem) &&
    minRedeem >= 1
  const pointsRule: PointsRule = {
    earnSatang: earnSatang ?? settings.pointsEarnSatang,
    redeemSatang: redeemSatang ?? settings.pointsRedeemSatang,
    minRedeem: Number.isInteger(minRedeem) ? minRedeem : settings.pointsMinRedeem,
  }
  const printerIp = form.receiptPrinterIp.trim()
  const isPrinterIpValid = printerIp === '' || /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(printerIp)
  const printerPort = Number(form.receiptPrinterPort)
  const isPrinterPortValid =
    form.receiptPrinterPort.trim() !== '' && Number.isInteger(printerPort) && printerPort >= 1 && printerPort <= 65535
  const isPrinterValid =
    isPrinterIpValid &&
    isPrinterPortValid &&
    (!form.receiptPrinterEnabled || printerIp !== '') &&
    (!form.cashDrawerEnabled || form.receiptPrinterEnabled)
  // The logo has its own upload and remove buttons, so it is neither compared nor sent with the form.
  const { logoUrl: _logoUrl, ...persisted } = settings
  const changes: Omit<ShopSettings, 'logoUrl'> = {
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
    receiptPrinterIp: printerIp || null,
    receiptPrinterPort: isPrinterPortValid ? printerPort : settings.receiptPrinterPort,
    receiptPrinterEnabled: form.receiptPrinterEnabled,
    cashDrawerEnabled: form.cashDrawerEnabled,
    homeView: form.homeView,
    tablesEnabled: form.tablesEnabled,
    modifiersEnabled: form.modifiersEnabled,
    promptpayMode: form.promptpayMode,
    promptpayTarget: normalizePromptPayTarget(form.promptpayTarget),
    // Points are edited in their own section, next to the features they change.
    pointsEnabled: form.pointsEnabled,
    pointsEarnSatang: pointsRule.earnSatang,
    pointsRedeemSatang: pointsRule.redeemSatang,
    pointsMinRedeem: pointsRule.minRedeem,
  }
  const isDirty = JSON.stringify(changes) !== JSON.stringify(persisted)
  const canSave =
    isDirty && isRateValid && isPromptPayValid && isPrinterValid && isPointsValid && changes.shopName !== '' && !save.isPending

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
        <Field label={t('shop.homeView')} hint={form.tablesEnabled ? t('shop.homeViewHint') : t('features.homeNeedsTables')}>
          <Select value={form.homeView} onValueChange={(value) => set('homeView', value as ShopSettings['homeView'])}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOME_VIEWS.map((view) => (
                <SelectItem key={view} value={view} disabled={view === 'tables' && !form.tablesEnabled}>
                  {t(`shop.homeViews.${view}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title={t('features.title')}>
        <FeatureSwitch
          label={t('features.tables')}
          hint={t('features.tablesHint')}
          checked={form.tablesEnabled}
          onChange={(on) => setForm(withTablesSwitch(form, on))}
        />
        <FeatureSwitch
          label={t('features.modifiers')}
          hint={t('features.modifiersHint')}
          checked={form.modifiersEnabled}
          onChange={(on) => set('modifiersEnabled', on)}
        />
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
                  {code} · {currencyName(code)}
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

      <Section title={t('points.title')}>
        <FeatureSwitch
          label={t('points.enabled')}
          hint={t('points.enabledHint')}
          checked={form.pointsEnabled}
          onChange={(on) => set('pointsEnabled', on)}
        />
        <Field label={t('points.earn')} hint={t('points.earnHint')}>
          <Input
            className="h-10 text-right tabular-nums"
            inputMode="decimal"
            value={form.pointsEarn}
            aria-invalid={earnSatang === null || earnSatang < 100}
            onChange={(event) => set('pointsEarn', event.target.value)}
          />
        </Field>
        <Field label={t('points.redeem')} hint={t('points.redeemHint')}>
          <Input
            className="h-10 text-right tabular-nums"
            inputMode="decimal"
            value={form.pointsRedeem}
            aria-invalid={redeemSatang === null || redeemSatang < 1}
            onChange={(event) => set('pointsRedeem', event.target.value)}
          />
        </Field>
        <Field label={t('points.minRedeem')} hint={t('points.minRedeemHint')}>
          <Input
            className="h-10 text-right tabular-nums"
            inputMode="numeric"
            value={form.pointsMinRedeem}
            aria-invalid={!Number.isInteger(minRedeem) || minRedeem < 1}
            onChange={(event) => set('pointsMinRedeem', event.target.value)}
          />
        </Field>
        {isPointsValid ? (
          <>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t('points.example', { amount: money.format(125_050), points: pointsEarned(125_050, pointsRule) })}
            </p>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t('points.redeemExample', {
                points: pointsRule.minRedeem,
                amount: money.format(pointsDiscountSatang(pointsRule.minRedeem, pointsRule)),
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {t('points.invalid')}
          </p>
        )}
      </Section>

      <Section title={t('promptpay.title')}>
        <Field label={t('promptpay.mode')} hint={t('promptpay.modeHint')}>
          <Select value={form.promptpayMode} onValueChange={(value) => set('promptpayMode', value as ShopSettings['promptpayMode'])}>
            <SelectTrigger className="h-10! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMPTPAY_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`promptpay.modes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={t('promptpay.target')}
          hint={
            !isPromptPayValid
              ? t('promptpay.invalidTarget')
              : form.promptpayMode === 'static' && normalizePromptPayTarget(form.promptpayTarget) === null
                ? t('promptpay.staticWithoutTarget')
                : t('promptpay.targetHint')
          }
        >
          <Input
            className="h-10 tabular-nums"
            inputMode="numeric"
            value={form.promptpayTarget}
            maxLength={13}
            placeholder={t('shop.optional')}
            aria-invalid={!isPromptPayValid}
            onChange={(event) => set('promptpayTarget', event.target.value)}
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
        <ReceiptLogoField />
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

      <Section title={t('printer.title')}>
        <Field
          label={t('printer.ip')}
          hint={!isPrinterIpValid ? t('printer.invalidIp') : t('printer.ipHint')}
        >
          <Input
            className="h-10 tabular-nums"
            inputMode="decimal"
            value={form.receiptPrinterIp}
            maxLength={45}
            placeholder="192.168.1.50"
            aria-invalid={!isPrinterIpValid}
            onChange={(event) => set('receiptPrinterIp', event.target.value)}
          />
        </Field>
        <Field
          label={t('printer.port')}
          hint={!isPrinterPortValid ? t('printer.invalidPort') : t('printer.portHint')}
        >
          <Input
            className="h-10 text-right tabular-nums"
            inputMode="numeric"
            value={form.receiptPrinterPort}
            maxLength={5}
            aria-invalid={!isPrinterPortValid}
            onChange={(event) => set('receiptPrinterPort', event.target.value)}
          />
        </Field>
        <FeatureSwitch
          label={t('printer.enabled')}
          hint={printerIp === '' ? t('printer.needsIp') : t('printer.enabledHint')}
          checked={form.receiptPrinterEnabled}
          onChange={(on) => set('receiptPrinterEnabled', on)}
        />
        <FeatureSwitch
          label={t('printer.drawer')}
          hint={!form.receiptPrinterEnabled ? t('printer.needsPrinter') : t('printer.drawerHint')}
          checked={form.cashDrawerEnabled}
          onChange={(on) => set('cashDrawerEnabled', on)}
        />
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
        {settings.data && (
          <div className="mx-auto mt-6 max-w-3xl">
            <ConnectDevicesPanel />
          </div>
        )}
        {settings.data && (
          <div className="mx-auto mt-4 max-w-3xl">
            <UpdatePanel />
          </div>
        )}
      </div>
    </>
  )
}
