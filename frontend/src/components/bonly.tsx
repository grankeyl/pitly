/*
 * Примитивы экранов Pitly — скрещение двух продуктов.
 *   От Revolut — композиция: сумма и герой по центру на тональной канве, круги действий, карточки-списки, плавающий таб-бар.
 *   От Wise — голос: жирные заголовки секций 20, подчёркнутые ссылки-действия, карусель карточек (счета Wise),
 *   лента операций, чипы, крупный радиус 24, плоские поверхности без теней.
 * Шаблоны: «деньги» (MoneyHeader), «объект» (Hero + ActionCircles), «задача» (PageTitle + кнопка снизу).
 * Сетка: поля 16, строка 60, аватар 40, между секциями 28, заголовок → карточка 10.
 * Углы круглые: круги, пилюли, карточки 16 — классы r-card / r-field / r-ctl / r-avatar / r-hero.
 * Шрифт SF Pro (системный); font-display — жирное начертание для сумм и заголовков.
 */
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { formatMoney } from '../lib/format'
import { haptic, tgBackButton } from '../lib/telegram'
import { Icon, type IconName } from './Icon'
import channelAvatar from '../assets/avatars/channel.jpg'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

const tapProps = (onClick?: () => void) =>
  onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => { haptic.tap(); onClick() },
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); haptic.tap(); onClick() } },
      }
    : {}

/** Глифы в исходных SVG занимают разную долю рамки — выравниваем оптически. */
const ICON_SIZE: Partial<Record<IconName, number>> = { upRight2: 13, plus: 16, link: 20, copy: 18, chart: 18, check: 18, ticket: 20, badgeGem: 18, users: 18, wallet: 18, search2: 18 }
const iconSize = (name: IconName, fallback = 18) => ICON_SIZE[name] ?? fallback

/** Экран: 393 по центру, кнопка «Назад» Telegram, место под нижнюю кнопку / таб-бар. */
export function Screen({ children, bottom, back = true, onBack, fallback = '/' }: { children: ReactNode; bottom?: ReactNode; back?: boolean; onBack?: () => void; fallback?: string }) {
  const navigate = useNavigate()
  // Экран, открытый по ссылке, первый в истории: возвращаться некуда, поэтому «назад» ведет на запасной экран
  const first = useLocation().key === 'default'
  useEffect(() => {
    if (!back) {
      tgBackButton.hide()
      return
    }
    tgBackButton.show()
    return tgBackButton.onClick(() => {
      if (onBack) onBack()
      else if (first) navigate(fallback, { replace: true })
      else navigate(-1)
    })
  }, [back, navigate, onBack, first, fallback])

  return (
    <div className="screen relative mx-auto flex min-h-dvh w-full max-w-[393px] flex-col pb-[calc(var(--safe-bottom)+112px)]">
      {children}
      {bottom && (
        <>
          <BottomFade />
          <div className="fixed bottom-[calc(var(--safe-bottom)+20px)] left-1/2 z-30 w-full max-w-[393px] -translate-x-1/2 px-[16px]">{bottom}</div>
        </>
      )}
    </div>
  )
}

/** Затухание контента под нижней кнопкой / таб-баром. */
export function BottomFade() {
  return <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 h-[calc(var(--safe-bottom)+112px)] w-full max-w-[393px] -translate-x-1/2 bg-gradient-to-t from-bg from-35% to-transparent" />
}

/* ---------- Шапки трёх шаблонов ---------- */

/** «Деньги»: подпись, сумма 40 и пояснение по центру, как баланс в Revolut. */
/** Число плавно добегает до значения: при первом показе с нуля, дальше от прежнего значения. */
export function useCountUp(target: number, ms = 700): number {
  const [value, setValue] = useState(target)
  const from = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setValue(target); return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - Math.pow(1 - t, 4)
      const v = Math.round(a + (target - a) * eased)
      from.current = v
      setValue(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

/** Сумма в копейках, которая добегает до значения. Копейки показываем только в конце, чтобы цифры не мельтешили. */
export function Money({ value, currency }: { value: number; currency?: string }) {
  const v = useCountUp(value)
  return <>{formatMoney(v === value ? v : Math.round(v / 100) * 100, currency)}</>
}

export function MoneyHeader({ caption, amount, sub }: { caption: string; amount: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-col items-center px-[24px] pt-[36px] text-center">
      <p className="text-[14px] leading-[18px] text-text-2">{caption}</p>
      <p className="font-display mt-[4px] max-w-full truncate text-[40px] leading-[46px] tracking-[-0.02em] text-text">{amount}</p>
      {sub && <p className="mt-[4px] text-[14px] leading-[18px] text-muted">{sub}</p>}
    </header>
  )
}

/** «Задача»: крупный заголовок слева и пояснение. */
export function PageTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <header className="px-[20px] pt-[20px]">
      <h1 className="font-display text-balance break-words text-[26px] leading-[32px] tracking-[-0.01em] text-text">{title}</h1>
      {sub && <p className="mt-[6px] text-pretty text-[15px] leading-[20px] text-muted">{sub}</p>}
    </header>
  )
}

type Tone = 'lime' | 'dark' | 'neutral' | 'brand' | 'teal' | 'accent'
const toneClass = (tone: Tone) =>
  tone === 'lime' || tone === 'accent' ? 'bg-accent text-on-accent'
  : tone === 'teal' ? 'bg-green-soft text-green'
  : tone === 'brand' ? 'bg-surface-2 text-text'
  : 'bg-glass text-text'

/**
 * Заглушка аватара: пока у канала нет фото из Telegram, ему достаётся одна из шести картинок.
 * Выбор стабилен по названию, так что канал всегда выглядит одинаково.
 */
/** Заглушка аватарки канала: одна картинка для всех, пока нет настоящих фото из Telegram. */
export function avatarImage(_seed: string): string {
  return channelAvatar
}

/** Круг героя 72: аватар-буква или иконка. */
export function Circle108({ icon, letter, tone, onClick, seed }: { icon?: IconName; letter?: string; tone?: Tone; onClick?: () => void; seed?: string }) {
  const t = tone ?? (letter ? 'brand' : 'neutral')
  const cls = toneClass(t)
  const style = undefined
  if (t === 'brand' && seed && !icon) {
    const img = <img src={avatarImage(seed)} alt="" draggable={false} className="h-full w-full object-cover" />
    return onClick ? (
      <button onClick={() => { haptic.tap(); onClick() }} className="tap r-hero h-[72px] w-[72px] shrink-0 overflow-hidden">{img}</button>
    ) : (
      <div className="r-hero h-[72px] w-[72px] shrink-0 overflow-hidden">{img}</div>
    )
  }
  const inner = icon ? <Icon name={icon} size={30} className={icon === 'link' ? 'rotate-90' : undefined} /> : <span className="font-display text-[28px] leading-none">{letter}</span>
  return onClick ? (
    <button onClick={() => { haptic.tap(); onClick() }} style={style} className={cx('tap r-hero grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden', cls)}>{inner}</button>
  ) : (
    <div style={style} className={cx('r-hero grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden', cls)}>{inner}</div>
  )
}

/** «Объект»: круг 72, заголовок 22/26, подпись 14/18 — по центру. */
export function Hero({ circle, title, subtitle }: { circle: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="flex flex-col items-center px-[24px] pt-[24px] text-center">
      {circle}
      <h1 className="font-display mt-[14px] max-w-full text-balance break-words text-[22px] leading-[28px] tracking-[-0.01em] text-text">{title}</h1>
      {subtitle && <p className="mt-[4px] max-w-full break-words text-[14px] leading-[18px] text-muted">{subtitle}</p>}
    </header>
  )
}

/* ---------- Действия ---------- */

type Action = { icon: IconName; label: string; onClick: () => void; primary?: boolean; disabled?: boolean }

/** Круги действий Revolut: круг 44 + подпись 12. До четырёх в ряд. */
export function ActionCircles({ actions, className }: { actions: Action[]; className?: string }) {
  return (
    <div className={cx('flex items-start justify-center gap-[4px] px-[16px]', className)}>
      {actions.map((a) => (
        <button key={a.label} disabled={a.disabled} onClick={() => { haptic.tap(); a.onClick() }} className="tap flex w-[84px] flex-col items-center gap-[6px] disabled:opacity-40">
          <span className={cx('grid h-[48px] w-[48px] place-items-center', a.primary ? 'liquid liquid-lime' : 'liquid liquid-dark')}>
            <Icon name={a.icon} size={iconSize(a.icon)} className={a.icon === 'link' ? 'rotate-90' : undefined} />
          </span>
          <span className="max-w-full truncate text-[13px] font-semibold leading-[16px] text-text">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Кнопки-пилюли Wise в ряд: 40, первая — основная. Ряд прокручивается, если не помещается. */
export function ActionPills({ actions, className }: { actions: Action[]; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-[8px] overflow-x-auto px-[16px]', className)}>
      {actions.map((a) => (
        <button
          key={a.label}
          disabled={a.disabled}
          onClick={() => { haptic.tap(); a.onClick() }}
          className={cx('tap liquid flex h-[40px] shrink-0 items-center gap-[8px] px-[16px] text-[15px] font-semibold leading-[20px] disabled:opacity-40', a.primary ? 'liquid-lime' : 'liquid-dark')}
        >
          <Icon name={a.icon} size={iconSize(a.icon, 16)} className={a.icon === 'link' ? 'rotate-90' : undefined} />
          {a.label}
        </button>
      ))}
    </div>
  )
}

/** Чипы выбора Wise: 36, выбранный — акцент. */
export function Chips<T extends string | number>({ options, value, onChange, wrap, center, className, label }: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  wrap?: boolean
  center?: boolean
  className?: string
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex gap-[8px] px-[16px]', wrap ? 'flex-wrap' : 'no-scrollbar overflow-x-auto', center && 'justify-center', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => { if (!active) { haptic.select(); onChange(o.value) } }}
            className={cx('tap liquid h-[38px] shrink-0 px-[16px] text-[15px] font-medium leading-[20px]', active ? 'chip-on' : 'liquid-dark')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Чипы с несколькими выбранными значениями. Последний выбранный снять нельзя, если задан min. */
export function ChipsMulti<T extends string>({ options, value, onChange, min = 0, className, label }: {
  options: { value: T; label: ReactNode }[]
  value: T[]
  onChange: (v: T[]) => void
  min?: number
  className?: string
  label?: string
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex flex-wrap gap-[8px] px-[16px]', className)}>
      {options.map((o) => {
        const active = value.includes(o.value)
        const locked = active && value.length <= min
        return (
          <button
            key={o.value}
            aria-pressed={active}
            aria-disabled={locked}
            onClick={() => {
              if (locked) { haptic.error(); return }
              haptic.select()
              onChange(active ? value.filter((x) => x !== o.value) : [...value, o.value])
            }}
            className={cx('tap liquid h-[38px] shrink-0 px-[16px] text-[15px] font-medium leading-[20px]', active ? 'chip-on' : 'liquid-dark')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Шаги формы: номер и название, текущий выделен, по пройденным можно вернуться. */
export function Steps({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Шаги" className="flex items-center gap-[6px] px-[20px] pt-[16px]">
      {steps.map((s, i) => {
        const active = i === current
        const reachable = i < current
        return (
          <button
            key={s}
            aria-current={active ? 'step' : undefined}
            disabled={!reachable && !active}
            onClick={() => { if (reachable) { haptic.select(); onSelect(i) } }}
            className={cx('flex h-[28px] items-center gap-[6px] rounded-full pl-[4px] pr-[10px] text-[13px] font-medium leading-[16px] transition-colors duration-200', active ? 'bg-glass text-text' : 'text-dim', reachable && 'tap')}
          >
            <span className={cx('tnum grid h-[20px] w-[20px] place-items-center rounded-full text-[12px] font-semibold', active ? 'bg-accent text-on-accent' : reachable ? 'bg-glass text-text' : 'bg-glass text-dim')}>{i + 1}</span>
            {s}
          </button>
        )
      })}
    </nav>
  )
}

/** Основная кнопка экрана: пилюля 48. */
export function BottomLime({ children, onClick, disabled, loading }: { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={() => { haptic.tap(); onClick?.() }}
      className="tap liquid liquid-lime flex h-[48px] w-full items-center justify-center overflow-hidden whitespace-nowrap px-[24px] text-[16px] font-bold leading-[24px] disabled:opacity-40"
    >
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  )
}

/* ---------- Секции и списки ---------- */

/** Заголовок секции в голосе Wise: жирный 20/24; справа действие — подчёркнутая ссылка. */
export function SectionTitle({ children, className, action }: { children: ReactNode; className?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-[12px] px-[20px]', className)}>
      <h2 className="font-display text-[18px] leading-[24px] text-text">{children}</h2>
      {action && (
        <button onClick={() => { haptic.tap(); action.onClick() }} className="tap -my-[8px] py-[8px] text-[15px] font-semibold leading-[20px] text-accent-2">
          {action.label}
        </button>
      )}
    </div>
  )
}

/** Карусель карточек (счета Wise): горизонтальная прокрутка с прилипанием. */
export function Carousel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('no-scrollbar mt-[10px] flex snap-x snap-mandatory gap-[8px] overflow-x-auto px-[16px] [scroll-padding-inline:16px]', className)}>
      {children}
    </div>
  )
}

/** Карточка-список: радиус 16, строки без рамок. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('r-card mx-[16px] mt-[10px] overflow-hidden bg-surface', className)}>{children}</div>
}

export function ListRow({ avatar, title, subtitle, trailing, trailingSub, chevron, onClick, first }: {
  avatar?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  trailingSub?: ReactNode
  chevron?: boolean
  onClick?: () => void
  first?: boolean
}) {
  const showChevron = chevron ?? !!onClick
  return (
    <>
      {!first && <div className={cx('h-px bg-separator', avatar ? 'ml-[68px]' : 'ml-[16px]')} />}
      <div {...tapProps(onClick)} className={cx('flex min-h-[60px] items-center py-[10px] pl-[16px]', showChevron ? 'pr-[10px]' : 'pr-[16px]', onClick && 'tap cursor-pointer')}>
        {avatar}
        <div className={cx('flex min-w-0 flex-1 flex-col gap-[1px]', !!avatar && 'ml-[12px]')}>
          <span className="truncate text-[16px] font-semibold leading-[21px] text-text">{title}</span>
          {subtitle && <span className="truncate text-[14px] leading-[18px] text-muted">{subtitle}</span>}
        </div>
        {(trailing !== undefined || trailingSub) && (
          <div className="ml-[12px] flex shrink-0 flex-col items-end gap-[1px] text-right">
            {trailing !== undefined && <span className="tnum text-[16px] font-semibold leading-[21px] text-text">{trailing}</span>}
            {trailingSub && <span className="text-[12px] leading-[15px] text-muted">{trailingSub}</span>}
          </div>
        )}
        {showChevron && <Icon name="v2Chevron" size={18} className="ml-[6px] shrink-0 text-dim" />}
      </div>
    </>
  )
}

/** Одиночная выбираемая карточка (тариф на странице оплаты): радиус 16, выбранная — кольцо акцента. */
export function Card82({ title, subtitle, trailing, chevron, selected, onClick, leading }: {
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  selected?: boolean
  onClick?: () => void
  leading?: ReactNode
}) {
  const showChevron = chevron ?? !!onClick
  return (
    <div
      {...tapProps(onClick)}
      aria-pressed={onClick && selected !== undefined ? selected : undefined}
      className={cx(
        'r-card flex min-h-[64px] items-center py-[11px] pl-[16px] transition-colors duration-200',
        showChevron ? 'pr-[10px]' : 'pr-[16px]',
        onClick && 'tap cursor-pointer',
        selected ? 'bg-surface-2' : 'bg-surface',
      )}
    >
      {leading && <div className="mr-[12px] shrink-0">{leading}</div>}
      {onClick && selected !== undefined && <span className="mr-[12px]"><SelectMark on={selected} /></span>}
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="truncate text-[16px] font-semibold leading-[21px] text-text">{title}</span>
        {subtitle && <span className="truncate text-[14px] leading-[18px] text-muted">{subtitle}</span>}
      </div>
      {trailing && <div className="tnum ml-[12px] shrink-0 text-right text-[17px] font-bold leading-[21px] text-text">{trailing}</div>}
      {showChevron && <Icon name="v2Chevron" size={18} className="ml-[6px] shrink-0 text-dim" />}
    </div>
  )
}

/** Отметка выбора: заполненный круг с галочкой. Невыбранный — едва заметный круг без обводки. */
export function SelectMark({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cx('grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full transition-colors duration-200', on ? 'bg-accent text-on-accent' : 'bg-text/10')}>
      {on && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 5 8.6l4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

/** Плитка показателя: значение 22 сверху, подпись 13 снизу. */
export function StatTile({ label, value, tone = 'text', onClick }: { label: ReactNode; value: ReactNode; tone?: 'text' | 'lime' | 'muted'; onClick?: () => void }) {
  const color = tone === 'lime' ? 'text-accent-2' : tone === 'muted' ? 'text-muted' : 'text-text'
  return (
    <div {...tapProps(onClick)} className={cx('r-card flex flex-col gap-[2px] bg-surface px-[16px] py-[14px]', onClick && 'tap cursor-pointer')}>
      <span className={cx('font-display truncate text-[24px] leading-[28px] tracking-[-0.025em]', color)}>{value}</span>
      <span className="truncate text-[13px] leading-[16px] text-muted">{label}</span>
    </div>
  )
}

export function CardGrid({ children, className, cols = 2 }: { children: ReactNode; className?: string; cols?: 2 | 3 }) {
  return <div className={cx('mt-[10px] grid gap-[8px] px-[16px]', cols === 3 ? 'grid-cols-3' : 'grid-cols-2', className)}>{children}</div>
}

export function CardStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mt-[10px] flex flex-col gap-[8px] px-[16px]', className)}>{children}</div>
}

/** Круглый значок 36 для строк. */
export function IconTile({ icon, color = 'blue' }: { icon: IconName; color?: 'blue' | 'purple' | 'lime' | 'gray' | 'teal' }) {
  const colors = { blue: 'bg-accent text-on-accent', purple: 'bg-accent text-on-accent', lime: 'bg-accent text-on-accent', teal: 'bg-green-soft text-green', gray: 'bg-glass text-text' }
  return (
    <span className={cx('r-avatar grid h-[40px] w-[40px] shrink-0 place-items-center', colors[color])}>
      <Icon name={icon} size={iconSize(icon)} className={icon === 'link' ? 'rotate-90' : undefined} />
    </span>
  )
}

/** Круг 36 — аватар строки: буква (forest + accent), цифра шага (нейтральный) или иконка. */
export function Circle47({ letter, icon, tone, seed }: { letter?: string; icon?: IconName; tone?: Tone; seed?: string }) {
  const t = tone ?? (letter && !/^\d+$/.test(letter) ? 'brand' : 'neutral')
  const cls = toneClass(t)
  if (t === 'brand' && seed && !icon) {
    return (
      <span className="r-avatar block h-[40px] w-[40px] shrink-0 overflow-hidden">
        <img src={avatarImage(seed)} alt="" draggable={false} className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span className={cx('r-avatar grid h-[40px] w-[40px] shrink-0 place-items-center overflow-hidden', cls)}>
      {icon ? <Icon name={icon} size={iconSize(icon)} className={icon === 'link' ? 'rotate-90' : undefined} /> : <span className="font-display text-[16px] leading-none">{letter}</span>}
    </span>
  )
}

/* ---------- Поля ---------- */

export function FieldCard({ label, value, onChange, placeholder, inputMode, type, trailing, error }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'numeric' | 'decimal' | 'tel' | 'text'
  type?: string
  trailing?: ReactNode
  error?: string | null
}) {
  return (
    <label className={cx('r-field flex h-[60px] cursor-text items-center bg-surface px-[16px] transition-colors duration-200 focus-within:bg-surface-2')}>
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className={cx('truncate text-[12px] leading-[15px]', error ? 'text-danger' : 'text-muted')}>{error ?? label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          type={type}
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={!!error}
          className="w-full bg-transparent text-[16px] font-medium leading-[21px] text-text outline-none placeholder:font-normal placeholder:text-dim"
        />
      </div>
      {trailing && <div className="ml-[12px] shrink-0">{trailing}</div>}
    </label>
  )
}

export function TextCard({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="r-field flex cursor-text flex-col gap-[1px] bg-surface px-[16px] py-[11px] transition-colors duration-200 focus-within:bg-surface-2">
      <span className="text-[12px] leading-[15px] text-muted">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className="w-full resize-none bg-transparent text-[16px] font-medium leading-[21px] text-text outline-none placeholder:font-normal placeholder:text-dim" />
    </label>
  )
}

/** Подпись под блоком: пояснение, ошибка или успех. */
export function Note({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'danger' | 'lime' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'lime' ? 'text-green' : 'text-dim'
  return <p role={tone === 'danger' ? 'alert' : undefined} className={cx('mt-[10px] px-[20px] text-pretty text-[13px] leading-[17px]', color)}>{children}</p>
}

/* ---------- Всплывающее окно ---------- */

/**
 * Небольшое окно снизу: затемнение, заголовок, пояснение и действия. Закрывается нажатием мимо или кнопкой «Отмена».
 * Опасное действие стоит отдельной красной кнопкой, поэтому второго подтверждения не нужно.
 */
export function Sheet({ open, onClose, title, text, children }: { open: boolean; onClose: () => void; title: string; text?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Закрыть" onClick={onClose} className="sheet-backdrop absolute inset-0 cursor-default bg-black/60" />
      <div role="dialog" aria-modal="true" aria-label={title} className="sheet-panel relative mx-[8px] mb-[calc(var(--safe-bottom)+8px)] w-full max-w-[377px] rounded-[28px] bg-surface p-[16px]">
        <p className="font-display text-balance px-[4px] pt-[4px] text-[18px] leading-[24px] text-text">{title}</p>
        {text && <p className="mt-[4px] text-pretty px-[4px] text-[14px] leading-[19px] text-muted">{text}</p>}
        <div className="mt-[16px] flex flex-col gap-[8px]">
          {children}
          <button type="button" onClick={() => { haptic.tap(); onClose() }} className="tap liquid liquid-dark h-[48px] w-full text-[16px] font-semibold leading-[21px]">
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

/** Красная кнопка опасного действия для всплывающего окна. */
export function DangerButton({ children, onClick, loading }: { children: ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <button type="button" disabled={loading} aria-busy={loading} onClick={() => { haptic.tap(); onClick() }} className="tap flex h-[48px] w-full items-center justify-center rounded-full bg-danger/15 text-[16px] font-semibold leading-[21px] text-danger disabled:opacity-60">
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  )
}

/* ---------- Состояния ---------- */

/** Пустое состояние: по центру заголовок, строка пояснения и при необходимости действие. Без значков и рамок. */
export function Empty({ title, text, action, className }: { title: string; text?: string; action?: { label: string; onClick: () => void }; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center px-[32px] text-center', className)}>
      <p className="font-display text-balance text-[18px] leading-[24px] text-text">{title}</p>
      {text && <p className="mt-[4px] max-w-[280px] text-pretty text-[14px] leading-[19px] text-muted">{text}</p>}
      {action && (
        <button type="button" onClick={() => { haptic.tap(); action.onClick() }} className="tap liquid liquid-lime mt-[16px] h-[44px] px-[20px] text-[15px] font-bold leading-[20px]">
          {action.label}
        </button>
      )}
    </div>
  )
}

export function ErrorCard({ error, onRetry, title = 'Не загрузилось' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : 'Попробуйте ещё раз'
  return (
    <div role="alert" className="r-card flex min-h-[60px] items-center bg-surface px-[16px] py-[10px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="text-[16px] font-medium leading-[21px] text-text">{title}</span>
        <span className="break-words text-[14px] leading-[18px] text-muted">{message}</span>
      </div>
      {onRetry && (
        <button type="button" onClick={() => { haptic.tap(); onRetry() }} className="tap pill-dark ml-[12px] h-[32px] shrink-0 px-[14px] text-[14px] font-semibold text-text">
          Повторить
        </button>
      )}
    </div>
  )
}

export function Bone({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

/** Скелетон экрана под нужный шаблон. */
export function ScreenSkeleton({ back = true, hero = true, cards = 3 }: { back?: boolean; hero?: boolean; cards?: number }) {
  return (
    <Screen back={back}>
      {hero ? (
        <div className="flex flex-col items-center pt-[24px]">
          <Bone className="r-hero h-[72px] w-[72px]" />
          <Bone className="mt-[14px] h-[22px] w-[168px] rounded-full" />
          <Bone className="mt-[8px] h-[14px] w-[120px] rounded-full" />
        </div>
      ) : (
        <div className="flex flex-col items-center pt-[36px]">
          <Bone className="h-[14px] w-[120px] rounded-full" />
          <Bone className="mt-[8px] h-[42px] w-[150px] rounded-[12px]" />
        </div>
      )}
      <Bone className="ml-[20px] mt-[28px] h-[20px] w-[120px] rounded-full" />
      <CardStack>
        {Array.from({ length: cards }, (_, i) => <Bone key={i} className="r-card h-[60px]" />)}
      </CardStack>
    </Screen>
  )
}

export function ScreenError({ error, onRetry, back = true }: { error: unknown; onRetry?: () => void; back?: boolean }) {
  return (
    <Screen back={back}>
      <div className="px-[16px] pt-[24px]"><ErrorCard error={error} onRetry={onRetry} /></div>
    </Screen>
  )
}
