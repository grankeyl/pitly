/*
 * Компоненты Pitly — из Figma через MCP (get_design_context), фрейм Bonly «Main View» 2006:11178.
 * Все размеры/цвета/тени ниже взяты из ответа Figma, не с экрана:
 *   баланс: «₽» Inter SemiBold 31 #6D6D71, число Inter Bold 46 #EDEDF2, подпись Inter Regular 16 #A1A1A3
 *   Liquid Glass Tab: 55.24px, gradient #ADEC24→#90C126 (lime) / #1E1E1E→#131313 (dark),
 *     inset-shadows: 3.83/3.83/0.64/-4.47 #2C2C2C; 2.55/2.55/1.28/-2.55 #2D2D2D; -2.55/-2.55/1.28/-2.55 #1B1B1B; 0 0 0 1.28 #999; 0 0 28.07 rgba(242,242,242,.5)
 *   подпись под кнопкой: Inter SemiBold 14 #EDEDF2
 *   секция: заголовок Inter SemiBold 18 #FFF (x=23); карточка #1E1E1E r26, x=11 w=369; строка: аватар 47 круг,
 *     название Inter SemiBold 17 #EDEDF2, подпись Inter Regular 14 #A1A1A3, разделитель #272727 1px (x=28..380)
 *   задачи: плитка 48.07 r12 (#3065E5 / #8130E5), название SF Pro Display Medium 17, пилюля #84EF38 21px r10.5 (pl5 pr7 pt2 pb3, SemiBold 13 black),
 *     кнопка «Проверить» 104.3×35 r30.86 border rgba(96,96,96,.4) gradient #1E1E1E→#191919, Medium 15
 *   таб-бар: Liquid Glass 276.5×60, px26 py17 gap45, gradient #141414→#0B0B0B, иконки 26/21/21.24/21.24, неактивные opacity .33
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { haptic, tgBackButton } from '../lib/telegram'
import { Icon, type IconName } from './Icon'
import { DsButton, DsTextArea, DsTextField, DsToggle } from './ds'
import { ChatNavBar, NavCircle } from './claude'
import { ErrorCard } from './bonly'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Корневые экраны: на них показывается таб-бар, а не кнопка «Назад». */
export const TAB_PATHS = ['/', '/profile', '/stats']

/** Экран: боковые отступы 11px (карточка 369 на 393), место под таб-бар. */
export function Page({ title, subtitle, right, children, footer, hero, gap = 20, nav, navRight, noNav }: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  footer?: ReactNode
  hero?: ReactNode
  /** Вертикальный зазор между блоками, px (во фрейме: карточка → задачи = 36). */
  gap?: number
  /** Заголовок в nav bar (MCP Apps chat nav bar). На не-табовых экранах nav bar с «×» показывается всегда. */
  nav?: ReactNode
  navRight?: ReactNode
  noNav?: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const isTab = TAB_PATHS.includes(location.pathname)

  useEffect(() => {
    if (isTab) {
      tgBackButton.hide()
      return
    }
    tgBackButton.show()
    return tgBackButton.onClick(() => navigate(-1))
  }, [isTab, navigate])

  const bottomPad = isTab ? 'pb-[calc(var(--safe-bottom)+124px)]' : 'pb-[calc(var(--safe-bottom)+24px)]'

  return (
    <div className={cx('mx-auto flex w-full max-w-[393px] flex-col', noNav ? 'min-h-0 flex-1' : 'min-h-screen', !footer && bottomPad)}>
      {!isTab && !noNav && <div className="mb-[12px]"><ChatNavBar left={<NavCircle icon="dsX24" label="Назад" onClick={() => navigate(-1)} />} title={typeof nav === 'string' ? nav : ''} right={navRight ?? <NavCircle icon="dsX24" hidden />} /></div>}
      {hero}
      <div className="flex flex-1 flex-col px-[11px]">
        {title && (
          <header className="mb-4 mt-6 flex items-start justify-between gap-3 px-3">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.4px]">{title}</h1>
              {subtitle && <p className="mt-1 text-[16px] text-muted">{subtitle}</p>}
            </div>
            {right}
          </header>
        )}
        <main className="flex flex-1 flex-col" style={{ gap }}>{children}</main>
      </div>
      {footer && (
        <div className={cx('sticky bottom-0 z-30 mt-4 bg-gradient-to-t from-bg from-70% to-transparent px-[11px] pt-6', isTab ? 'pb-[calc(var(--safe-bottom)+112px)]' : 'pb-[calc(var(--safe-bottom)+16px)]')}>
          {footer}
        </div>
      )}
    </div>
  )
}

/* ---------- Баланс и liquid-glass действия ---------- */

/** Баланс по центру, как в Revolut: подпись счёта сверху, сумма 48 bold, под ней необязательная пилюля. */
export function Balance({ amount, caption, symbol = '₽', pill }: { amount: string; caption: string; symbol?: string; pill?: ReactNode }) {
  return (
    <div className="flex flex-col items-center pt-[40px] text-center">
      <div className="text-[15px] leading-[20px] text-text-2">{caption}</div>
      <div className="mt-[4px] text-[48px] font-bold leading-[56px] tracking-[-0.025em] text-text">
        {amount}
        <span className="ml-[6px] font-semibold text-text-2">{symbol}</span>
      </div>
      {pill && <div className="mt-[12px]">{pill}</div>}
    </div>
  )
}

/** Liquid Glass Tab (Figma 2006:11498 / 2007:11511): круглая 55px, lime или dark. */
export function LiquidButton({ icon, tone = 'dark', size = 55, onClick, label, iconSize }: {
  icon: IconName
  tone?: 'lime' | 'dark'
  size?: number
  onClick?: () => void
  label?: string
  iconSize?: number
}) {
  return (
    <button
      aria-label={label}
      onClick={() => { haptic.tap(); onClick?.() }}
      className={cx('tap liquid grid shrink-0 place-items-center overflow-hidden rounded-full', tone === 'lime' ? 'liquid-lime' : 'liquid-dark')}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} className={icon === 'link' ? 'rotate-90' : undefined} />
    </button>
  )
}

/** Ряд действий: кнопка 55 + подпись SemiBold 14 (gap 11), колонки на расстоянии 60. */
/** Ряд действий Revolut: круги 48 (белый 12%) с подписью 13. */
export function ActionRow({ actions }: { actions: { icon: IconName; label: string; onClick: () => void; tone?: 'lime' | 'dark' }[] }) {
  return (
    <div className="flex items-start justify-center gap-[8px] px-[16px] pt-[32px] pb-[28px]">
      {actions.map((a) => (
        <button key={a.label} onClick={() => { haptic.tap(); a.onClick() }} className="tap flex w-[84px] flex-col items-center gap-[8px]">
          <span className={cx('liquid grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full', a.tone === 'lime' ? 'liquid-lime' : 'liquid-dark')}>
            <Icon name={a.icon} size={22} className={a.icon === 'link' ? 'rotate-90' : undefined} />
          </span>
          <span className="max-w-full truncate text-[13px] font-medium leading-[16px] text-text">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Секция-карточка «Каналы и группы» (2006:11497) ---------- */

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3">
      <h2 className="text-[18px] font-semibold leading-[22px] text-white">{children}</h2>
      {action}
    </div>
  )
}

export function Card({ children, className, onClick, padded }: { children: ReactNode; className?: string; onClick?: () => void; padded?: boolean }) {
  return (
    <div onClick={onClick ? () => { haptic.tap(); onClick() } : undefined} className={cx('rounded-[33px] bg-surface', padded && 'p-[17px]', onClick && 'tap cursor-pointer', className)}>
      {children}
    </div>
  )
}

export function Section({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[17px]">
      {title && <SectionTitle action={action}>{title}</SectionTitle>}
      <Card><div className="divide-y divide-separator px-[17px]">{children}</div></Card>
    </section>
  )
}

/** Строка карточки (2006:11460): аватар 47, SemiBold 17 / Regular 14, высота 78. */
export function Row({ leading, title, subtitle, value, valueSub, trailing, onClick }: {
  leading: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  valueSub?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}) {
  return (
    <div onClick={onClick ? () => { haptic.tap(); onClick() } : undefined} className={cx('flex min-h-[78px] items-center gap-[13px] py-[15.5px]', onClick && 'tap cursor-pointer')}>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <div className="truncate text-[17px] font-semibold leading-[21px]">{title}</div>
        {subtitle && <div className="truncate text-[14px] leading-[17px] text-muted">{subtitle}</div>}
      </div>
      {(value || valueSub) && (
        <div className="flex shrink-0 flex-col items-end gap-[6px] text-right">
          {value && <div className="text-[17px] font-semibold leading-[21px]">{value}</div>}
          {valueSub && <div className="text-[14px] leading-[17px] text-muted">{valueSub}</div>}
        </div>
      )}
      {trailing}
    </div>
  )
}

/* ---------- Задачи (2008:11555): плитка 48/r12 + пилюля + «Проверить» ---------- */

export function TaskRow({ icon, color = 'blue', title, pill, action, onClick }: {
  icon: IconName
  color?: 'blue' | 'purple' | 'lime' | 'gray'
  title: ReactNode
  pill?: ReactNode
  action?: ReactNode
  onClick?: () => void
}) {
  const colors = { blue: 'bg-forest', purple: 'bg-forest', lime: 'bg-accent', gray: 'bg-surface-2' }
  return (
    <div onClick={onClick ? () => { haptic.tap(); onClick() } : undefined} className={cx('flex items-center gap-[12px]', onClick && 'tap cursor-pointer')}>
      <span className={cx('grid h-[44px] w-[44px] shrink-0 place-items-center rounded-[11px] text-white', colors[color])}>
        <Icon name={icon} size={24} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="truncate text-[16px] font-medium leading-[20px]">{title}</div>
        {pill && <div className="flex min-w-0 items-center gap-1.5">{pill}</div>}
      </div>
      {action}
    </div>
  )
}

/** Список задач без карточки, зазор 28px между строками (598 → 674 во фрейме). */
export function TaskList({ children }: { children: ReactNode }) {
  return <div className="mt-[16px] flex flex-col gap-[22px] px-[28px]">{children}</div>
}

/** Пилюля (2008:11564): 21px, #84EF38, pl5 pr7, SemiBold 13 black, иконка 13. */
export function Pill({ children, icon = 'badgeCoin', tone = 'green' }: { children: ReactNode; icon?: IconName | null; tone?: 'green' | 'lime' | 'blue' | 'dark' | 'danger' }) {
  const tones = {
    green: 'bg-green-soft text-green',
    lime: 'bg-accent text-on-accent',
    blue: 'bg-glass text-accent-2',
    dark: 'bg-glass text-muted',
    danger: 'bg-danger-soft text-danger',
  }
  return (
    <span className={cx('r-tag inline-flex h-[22px] max-w-full items-center gap-[4px] overflow-hidden whitespace-nowrap px-[8px] text-[12px] font-semibold leading-[15px]', tones[tone])}>
      {icon && <Icon name={icon} size={12} />}
      <span className="truncate">{children}</span>
    </span>
  )
}

/* ---------- Кнопки: MCP Apps Button/Mobile (геометрия) + Bonly (цвета) ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'dark' | 'ghost' | 'danger' | 'secondary'
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
}

/** lg/md → Button Large 44; sm → Button Small 32. dark = Bonly «Проверить» (35px pill-dark). */
export function Button({ variant = 'primary', loading, size = 'lg', icon, className, children, disabled, onClick, ...rest }: ButtonProps) {
  if (variant === 'dark') {
    return (
      <button {...rest} type="button" disabled={disabled || loading} onClick={(e) => { haptic.tap(); onClick?.(e) }} className={cx('tap pill-dark inline-flex h-[32px] min-w-[88px] items-center justify-center whitespace-nowrap rounded-full px-[16px] text-[14px] font-semibold text-text disabled:opacity-40', className)}>
        {loading ? <Spinner /> : children}
      </button>
    )
  }
  if (variant === 'ghost') {
    return (
      <button {...rest} type="button" disabled={disabled || loading} onClick={(e) => { haptic.tap(); onClick?.(e) }} className={cx('tap inline-flex h-[44px] items-center justify-center gap-[8px] px-[16px] text-[16px] font-semibold text-lime disabled:opacity-50', className)}>
        {children}
      </button>
    )
  }
  return (
    <DsButton
      {...rest}
      kind={variant === 'danger' ? 'destructive' : variant === 'secondary' ? 'secondary' : 'primary'}
      size={size === 'sm' ? 'small' : 'large'}
      full={size === 'lg'}
      loading={loading}
      icon={icon}
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </DsButton>
  )
}

export function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
}

/* ---------- Аватары (Bonly: круг 47; плитка задач 48 r12) ---------- */

/** Аватар канала: нейтральный круг #272727 с буквой (в Bonly здесь фото). */
export function Tile({ title, size = 47, color, square, className }: { title: string; size?: number; color?: string; square?: boolean; className?: string }) {
  const letter = title.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className={cx('grid shrink-0 place-items-center font-semibold text-text', className)} style={{ width: size, height: size, background: color ?? 'var(--c-accent)', fontSize: Math.round(size * 0.4), borderRadius: square ? 10 * (size / 40) : '50%' }}>
      {letter}
    </div>
  )
}

export function Avatar({ src, size = 47 }: { src?: string | null; size?: number }) {
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-muted" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon name="user" size={size * 0.5} />}
    </div>
  )
}

/* ---------- Формы: MCP Apps text field / toggle ---------- */

/** Сегментированные вкладки на базе Button Small (32px): активная — primary, остальные — secondary. */
export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-[8px] px-[6px]">
      {options.map((o) => (
        <DsButton key={o.value} size="small" kind={o.value === value ? 'primary' : 'secondary'} className="flex-1" onClick={() => { haptic.select(); onChange(o.value) }}>
          {o.label}
        </DsButton>
      ))}
    </div>
  )
}

export function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-[11px] flex gap-[8px] overflow-x-auto px-[17px]">
      {options.map((o) => (
        <DsButton key={String(o.value)} size="small" kind={o.value === value ? 'primary' : 'secondary'} className="shrink-0" onClick={() => { haptic.select(); onChange(o.value) }}>
          {o.label}
        </DsButton>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <div className="px-[6px]">
      <DsTextField label={label} error={error ?? undefined} {...rest} />
      {hint && !error && <div className="px-[16px] pt-[6px] text-[13px] leading-[1.4] text-muted">{hint}</div>}
    </div>
  )
}

export function TextArea({ label, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return <div className="px-[6px]"><DsTextArea label={label} {...rest} /></div>
}

export function Toggle({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return <DsToggle on={on} onChange={onChange} />
}


/* ---------- Прочее ---------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton rounded-xl', className)} />
}


export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <ErrorCard error={error} onRetry={onRetry} />
}

