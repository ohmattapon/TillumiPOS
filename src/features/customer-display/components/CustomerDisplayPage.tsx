import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { createDateFormat, createMoney, type Locale, type Money } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useDisplayReceiver } from '../hooks/use-display-receiver'
import { useDisplaySlides } from '../hooks/use-display-slides'
import { ScanQr } from './ScanQr'
import { useFullscreen, useIdleCursor } from '../hooks/use-screen-chrome'
import type { DisplayLine, DisplayState } from '../lib/display-state'
import type { DisplaySlide } from '../lib/slideshow'

// One unit that follows the height of the screen, so the text is as large as the screen allows at 1 to 2 metres.
const UNIT = { '--u': 'clamp(12px, 1.9vh, 28px)' } as CSSProperties
const size = {
  label: 'text-[length:calc(var(--u)*1.2)]',
  row: 'text-[length:calc(var(--u)*1.75)]',
  title: 'text-[length:calc(var(--u)*3.2)]',
  total: 'text-[length:calc(var(--u)*4.7)]',
} as const

const IDLE: DisplayState = { kind: 'idle' }

/** The screen the customer faces. It shows what the till sends; only the marketing pictures come from the server's public endpoint, never the sale itself. */
export function CustomerDisplayPage() {
  const { t, i18n } = useTranslation('customerDisplay')
  const { view, connection } = useDisplayReceiver()
  const { slides, index: slideIndex, current: slide, markBroken } = useDisplaySlides()
  const hidden = useIdleCursor(3_000)
  const fullscreen = useFullscreen()

  const locale: Locale = view?.locale ?? (i18n.language === 'en' ? 'en' : 'th')
  useEffect(() => {
    // The shop chooses the language; follow what the till says without writing the till's saved choice.
    void i18n.changeLanguage(locale)
    document.documentElement.lang = locale
  }, [i18n, locale])

  const currency = view?.currency ?? 'THB'
  const money = useMemo(() => createMoney(currency, locale), [currency, locale])
  const clock = useMemo(() => createDateFormat(locale), [locale])
  const state = view?.state ?? IDLE
  const shopName = view?.shopName || t('brand')

  return (
    <div
      style={UNIT}
      onClick={fullscreen.enter}
      className={cn('flex h-svh flex-col overflow-hidden bg-canvas text-foreground select-none', hidden && 'cursor-none')}
    >
      <header className={cn('shrink-0 px-[3vh] pt-[2.5vh] font-semibold', size.row)}>{shopName}</header>

      {/* Keyed by the kind of screen, so a change fades in; users who ask for less motion get none. */}
      <main key={state.kind} className="flex min-h-0 flex-1 flex-col p-[3vh] motion-safe:animate-in motion-safe:fade-in">
        {state.kind === 'idle' && (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-[2vh] overflow-hidden text-center">
            {slide !== null && slideIndex !== null ? (
              <img
                key={slide.id}
                src={slide.imageUrl}
                alt={t('slideshow.alt', { index: slideIndex + 1, total: slides.length })}
                onError={() => markBroken(slideIndex)}
                className="absolute inset-0 h-full w-full object-cover motion-safe:animate-in motion-safe:fade-in"
              />
            ) : (
              <>
                <p className={cn('font-semibold', size.title)}>{shopName}</p>
                <p className={cn('text-muted-foreground', size.row)}>{t('idle.welcome')}</p>
              </>
            )}
            {connection.phase === 'waiting' && (
              <section className="relative mt-[3vh] rounded-xl border bg-card px-[3vh] py-[2vh] shadow-xs">
                <p className={cn('text-muted-foreground', size.label)}>{t('pairing.hint')}</p>
                <p
                  className={cn('font-semibold tabular-nums tracking-[0.2em]', size.title)}
                  aria-label={t('pairing.code', { code: connection.code.split('').join(' ') })}
                >
                  {connection.code}
                </p>
              </section>
            )}
          </div>
        )}

        {state.kind === 'selling' && (
          <>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-[3vh] lg:landscape:grid-rows-none lg:landscape:grid-cols-[3fr_2fr]">
              <Lines lines={state.lines} money={money} />
              <Summary
                rows={[
                  [t('selling.subtotal'), money.format(state.subtotalSatang)],
                  ...(state.discountSatang > 0 ? [[t('selling.discount'), `−${money.format(state.discountSatang)}`] as const] : []),
                  ...(state.vatMode !== 'none' && state.vatSatang > 0
                    ? [[state.vatMode === 'inclusive' ? t('selling.vatIncluded') : t('selling.vatAdded'), money.format(state.vatSatang)] as const]
                    : []),
                ]}
                totalLabel={t('selling.total')}
                total={money.format(state.totalSatang)}
              />
            </div>
            <SlideStrip
              slides={slides}
              index={slideIndex}
              alt={slideIndex === null ? '' : t('slideshow.alt', { index: slideIndex + 1, total: slides.length })}
              onBroken={markBroken}
            />
          </>
        )}

        {state.kind === 'paying' && (
          <>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-[3vh] lg:landscape:grid-rows-none lg:landscape:grid-cols-[3fr_2fr]">
              <Lines lines={state.lines} money={money} />
              <section className="flex min-h-0 flex-col items-center justify-center gap-[2vh] rounded-xl border bg-card p-[3vh] text-center shadow-xs">
              {state.qr && (
                <>
                  <p className={cn('font-semibold', size.row)}>{t('paying.scan')}</p>
                  <ScanQr qr={state.qr} alt={t('paying.qrAlt')} />
                </>
              )}
              <p className={cn('text-muted-foreground', size.label)}>{t('paying.due')}</p>
              <p className={cn('font-semibold tabular-nums', state.qr ? size.title : size.total)}>{money.format(state.totalSatang)}</p>
              {state.qr && 'expiresAt' in state.qr && (
                <p className={cn('text-muted-foreground tabular-nums', size.label)}>
                  {t('paying.expires', { time: clock.time(state.qr.expiresAt) })}
                </p>
              )}
            </section>
          </div>
          <SlideStrip
            slides={slides}
            index={slideIndex}
            alt={slideIndex === null ? '' : t('slideshow.alt', { index: slideIndex + 1, total: slides.length })}
            onBroken={markBroken}
          />
          </>
        )}

        {state.kind === 'paid' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-[2.5vh] text-center">
            <span className="flex size-[16vh] items-center justify-center rounded-full bg-success/10 text-success">
              <Check className="size-[9vh]" strokeWidth={2.5} aria-hidden />
            </span>
            <p className={cn('font-semibold', size.title)}>{t('paid.title')}</p>
            <p className={cn('text-muted-foreground', size.row)}>{t('paid.thanks')}</p>
            {state.changeSatang > 0 && (
              <p className={cn('tabular-nums', size.row)}>
                <span className="text-muted-foreground">{t('paid.change')} </span>
                <span className="font-semibold">{money.format(state.changeSatang)}</span>
              </p>
            )}
          </div>
        )}
      </main>

      {!fullscreen.active && (
        <footer className={cn('shrink-0 pb-[1.5vh] text-center text-muted-foreground', size.label)}>{t('fullscreen')}</footer>
      )}
    </div>
  )
}

/** The pictures as a quiet strip under the sale: it rotates with the idle carousel, with no buttons. */
function SlideStrip({
  slides,
  index,
  alt,
  onBroken,
}: {
  slides: readonly DisplaySlide[]
  index: number | null
  alt: string
  onBroken: (index: number) => void
}) {
  const slide = index === null ? undefined : slides[index]
  if (!slide) return null
  return (
    <div className="h-16 w-full shrink-0 overflow-hidden rounded-xl border bg-card shadow-xs">
      <img
        key={slide.id}
        src={slide.imageUrl}
        alt={alt}
        onError={() => index !== null && onBroken(index)}
        className="h-full w-full object-cover motion-safe:animate-in motion-safe:fade-in"
      />
    </div>
  )
}

/** The items so far. The newest stays in view, so a long basket scrolls instead of being cut off. */
function Lines({ lines, money }: { lines: DisplayLine[]; money: Money }) {
  const box = useRef<HTMLUListElement>(null)
  const lastQuantity = lines[lines.length - 1]?.quantity
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [lines.length, lastQuantity])

  return (
    <ul ref={box} className="min-h-0 divide-y overflow-y-auto rounded-xl border bg-card shadow-xs">
      {lines.map((line, index) => (
        <li key={index} className={cn('flex items-baseline gap-[2vh] px-[2.5vh] py-[1.6vh]', size.row)}>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-medium">{line.name}</p>
            {line.options.length > 0 && (
              <p className={cn('line-clamp-1 text-muted-foreground', size.label)}>{line.options.join(' · ')}</p>
            )}
          </div>
          <span className="shrink-0 text-muted-foreground tabular-nums">×{line.quantity}</span>
          <span className="w-[8ch] shrink-0 text-right font-medium tabular-nums">{money.plain(line.lineTotalSatang)}</span>
        </li>
      ))}
    </ul>
  )
}

/** The figures beside the items, with the total as the largest thing on the screen. */
function Summary({
  rows,
  totalLabel,
  total,
}: {
  rows: readonly (readonly [string, string])[]
  totalLabel: string
  total: string
}) {
  return (
    <section className="flex min-h-0 flex-col justify-end gap-[1.6vh] rounded-xl border bg-card p-[3vh] shadow-xs">
      {rows.map(([label, value]) => (
        <p key={label} className={cn('flex items-baseline justify-between gap-[2vh] tabular-nums', size.row)}>
          <span className="text-muted-foreground">{label}</span>
          <span>{value}</span>
        </p>
      ))}
      <div className="border-t pt-[2vh]">
        <p className={cn('text-muted-foreground', size.label)}>{totalLabel}</p>
        <p className={cn('font-semibold tabular-nums', size.total)}>{total}</p>
      </div>
    </section>
  )
}
