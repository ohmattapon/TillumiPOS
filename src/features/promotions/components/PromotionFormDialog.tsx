import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DatePicker } from '@/components/DatePicker'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useFormat, useSettings } from '@/features/settings'
import { cn } from '@/lib/utils'
import { useCreatePromotion, useUpdatePromotion, type Promotion } from '../api'
import {
  emptyPromotionForm, fromPromotion, toBody, todayIn, weekdayName,
  type PromotionForm,
} from '../lib/promotion-form'
import { emptyScope, scopeOf, scopeToBody, type ScopeSelection } from '../lib/promotion-scope'
import { PromotionScopePicker } from './PromotionScopePicker'

export function PromotionFormDialog({ promotion, onClose }: { promotion?: Promotion; onClose: () => void }) {
  const { t } = useTranslation('promotions')
  const { t: tc } = useTranslation()
  const { money, date, locale, currency } = useFormat()
  const shop = useSettings()
  const [form, setForm] = useState<PromotionForm>(() => (promotion ? fromPromotion(promotion, money) : emptyPromotionForm))
  const [scope, setScope] = useState<ScopeSelection>(() => (promotion ? scopeOf(promotion) : emptyScope))
  const [today] = useState(() => todayIn(shop.timeZone, new Date()))
  const create = useCreatePromotion()
  const update = useUpdatePromotion()
  const mutation = promotion ? update : create
  const result = toBody(form, money)
  const problems = result.ok ? [] : result.problems

  const set = <K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const toggleDay = (day: number) =>
    set('weekdays', form.weekdays.includes(day) ? form.weekdays.filter((chosen) => chosen !== day) : [...form.weekdays, day])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!result.ok || mutation.isPending) return
    const done = (saved: Promotion) => {
      toast.success(t(promotion ? 'toast.updated' : 'toast.created', { name: saved.name }))
      onClose()
    }
    const body = { ...result.body, scope: scopeToBody(scope) }
    if (promotion) update.mutate({ id: promotion.id, changes: body }, { onSuccess: done })
    else create.mutate(body, { onSuccess: done })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(promotion ? 'form.titleEdit' : 'form.titleNew')}</DialogTitle>
          <DialogDescription>{t('form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Only the fields scroll, so the confirm row stays at the bottom of the dialog. */}
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="promotion-name">{t('form.name')}</FieldLabel>
                <Input
                  id="promotion-name" autoFocus required maxLength={80} className="h-11"
                  aria-invalid={problems.includes('name') && form.name !== ''}
                  value={form.name} onChange={(event) => set('name', event.target.value)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="promotion-kind">{t('form.kind')}</FieldLabel>
                  <Select value={form.kind} onValueChange={(value) => set('kind', value === 'fixed' ? 'fixed' : 'percent')}>
                    <SelectTrigger id="promotion-kind" className="h-11 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="percent">{t('kind.percent')}</SelectItem>
                        <SelectItem value="fixed">{t('kind.fixed')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="promotion-value">
                    {form.kind === 'percent' ? t('form.valuePercent') : t('form.valueFixed', { currency })}
                  </FieldLabel>
                  <Input
                    id="promotion-value" inputMode="decimal" className="h-11 text-right tabular-nums"
                    aria-invalid={problems.includes('value') && form.value !== ''}
                    value={form.value} onChange={(event) => set('value', event.target.value)}
                  />
                </Field>
              </div>

              {form.kind === 'percent' && (
                <Field>
                  <FieldLabel htmlFor="promotion-max">{t('form.maxDiscount', { currency })}</FieldLabel>
                  <Input
                    id="promotion-max" inputMode="decimal" className="h-11 text-right tabular-nums"
                    aria-invalid={problems.includes('maxDiscount')}
                    value={form.maxDiscount} onChange={(event) => set('maxDiscount', event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t('form.maxDiscountHint')}</p>
                </Field>
              )}

              <PromotionScopePicker value={scope} onChange={setScope} />

              <Field>
                <FieldLabel htmlFor="promotion-min">{t('form.minSubtotal', { currency })}</FieldLabel>
                <Input
                  id="promotion-min" inputMode="decimal" className="h-11 text-right tabular-nums"
                  aria-invalid={problems.includes('minSubtotal')}
                  value={form.minSubtotal} onChange={(event) => set('minSubtotal', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('form.minSubtotalHint')}</p>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="promotion-starts">{t('form.startsOn')}</FieldLabel>
                  <DatePicker
                    id="promotion-starts" label={t('form.startsOn')} value={form.startsOn} today={today}
                    locale={locale} dateFormat={date} invalid={problems.includes('dates')}
                    onChange={(value) => set('startsOn', value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="promotion-ends">{t('form.endsOn')}</FieldLabel>
                  <DatePicker
                    id="promotion-ends" label={t('form.endsOn')} value={form.endsOn} today={today}
                    locale={locale} dateFormat={date} invalid={problems.includes('dates')}
                    onChange={(value) => set('endsOn', value)}
                  />
                </Field>
              </div>
              {(form.startsOn !== '' || form.endsOn !== '') && (
                <Button
                  type="button" variant="outline" className="h-11 self-start"
                  onClick={() => setForm((current) => ({ ...current, startsOn: '', endsOn: '' }))}
                >
                  {t('form.clearDate')}
                </Button>
              )}
              {problems.includes('dates') && <p role="alert" className="text-sm text-destructive">{t('problems.dates')}</p>}

              <Field>
                <FieldLabel>{t('form.weekdays')}</FieldLabel>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('form.weekdays')}>
                  {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                    <button
                      key={day} type="button" aria-pressed={form.weekdays.includes(day)} onClick={() => toggleDay(day)}
                      className={cn(
                        'h-11 min-w-11 rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        form.weekdays.includes(day) ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                      )}
                    >
                      {weekdayName(locale, day)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('form.weekdaysHint')}</p>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="promotion-window-start">{t('form.windowStart')}</FieldLabel>
                  <Input
                    id="promotion-window-start" type="time" className="h-11" aria-invalid={problems.includes('window')}
                    value={form.windowStart} onChange={(event) => set('windowStart', event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="promotion-window-end">{t('form.windowEnd')}</FieldLabel>
                  <Input
                    id="promotion-window-end" type="time" className="h-11" aria-invalid={problems.includes('window')}
                    value={form.windowEnd} onChange={(event) => set('windowEnd', event.target.value)}
                  />
                </Field>
              </div>
              <p className={cn('text-xs', problems.includes('window') ? 'text-destructive' : 'text-muted-foreground')}>
                {problems.includes('window') ? t('problems.window') : t('form.windowHint')}
              </p>

              <Field>
                <FieldLabel htmlFor="promotion-audience">{t('form.audience')}</FieldLabel>
                <Select value={form.audience} onValueChange={(value) => set('audience', value === 'members' ? 'members' : 'everyone')}>
                  <SelectTrigger id="promotion-audience" className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="everyone">{t('audience.everyone')}</SelectItem>
                      <SelectItem value="members">{t('audience.members')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <label className="flex h-11 items-center justify-between gap-3 text-sm font-medium">
                <span>{t('form.isActive')}</span>
                <Switch checked={form.isActive} onCheckedChange={(checked) => set('isActive', checked)} />
              </label>
            </FieldGroup>

            {mutation.error && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={mutation.isPending} onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={!result.ok || mutation.isPending}>
              {t(mutation.isPending ? 'form.saving' : 'form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
