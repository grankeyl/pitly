/*
 * Компоненты из Figma «MCP Apps for Claude» (file 58iOTmm2GKKw73SReWHu79), вытянуты через Figma MCP
 * get_design_context. Геометрия, размеры, тени и типографика — как в ответе Figma; цвета переведены
 * в тёмную палитру Bonly (см. --ds-* в styles.css).
 *
 *   Button / Mobile (1:2534): rounded-full, px16, h44 Large / h32 Small, Semibold 16 (lh 22.4) / 14 (lh 19.6),
 *       gap 8; Primary bg text/100; Secondary border 1px border/secondary; Destructive bg #b53333;
 *       Disabled opacity .5 (Destructive .6)
 *   text field (1:2752): header h40 px16 label 15 tertiary; field h44 r14 px16 border .5 border/secondary,
 *       drop-shadow 0 1.5 1.5 rgba(0,0,0,.05); Focused/Editing border 2 border/info; text 15 lh 1.4
 *   Toggle - Switch (1:407): 64×28 r100, knob 39×24 white inset 2; on accent, off fills/primary
 *   radio / check (1:2730, 1:2738): 24×24, состояния Default/Active (SVG-ассеты)
 *   icon button (1:2725): p6, Active bg background/secondary r999
 *   chat nav bar (1:2802): h54 px16, круглые 44 bg-transparent + shadow 0 2 8 rgba(0,0,0,.08),
 *       title 17 Semibold по центру (w280 pl16) + caret 24 (pt4)
 *   sheet (1:3270): bg black, px8 gap8; frame r44 сверху; grabber 36×5 border/300 в зоне h16; row h54, X слева 16/5
 *   input / composer (1:3254): w370 r26 bg-transparent shadow 0 2 8; button row p8 gap8; icons 24 в p6 r79; text 15 muted
 *   inline card (1:3125): header gap12 (24 квадрат r5 border .5 + label 14 tertiary); card r24 border .5 border/200
 *       shadow 0 2 8; плавающие круглые кнопки p8 border .5 shadow 0 2 4
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { haptic } from '../lib/telegram'
import { Icon, type IconName } from './Icon'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------- Button / Mobile ---------- */

export type DsButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  kind?: 'primary' | 'secondary' | 'destructive'
  size?: 'large' | 'small'
  loading?: boolean
  icon?: IconName
  full?: boolean
}

export function DsButton({ kind: type = 'primary', size = 'large', loading, icon, full, className, children, disabled, onClick, ...rest }: DsButtonProps) {
  const isDisabled = disabled || loading
  return (
    <button
      {...rest}
      type="button"
      disabled={isDisabled}
      onClick={(e) => { haptic.tap(); onClick?.(e) }}
      className={cx(
        'tap inline-flex items-center justify-center whitespace-nowrap rounded-full px-[16px] font-semibold',
        size === 'large' ? 'h-[48px] gap-[8px] text-[16px] leading-[24px]' : 'h-[32px] gap-[6px] text-[14px] leading-[20px]',
        type === 'primary' && 'liquid liquid-lime',
        type === 'secondary' && 'liquid liquid-dark',
        type === 'destructive' && 'bg-[var(--ds-danger)] text-white',
        isDisabled && (type === 'destructive' ? 'opacity-60' : 'opacity-50'),
        full && 'w-full',
        className,
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : (
        <>
          {icon && <Icon name={icon} size={size === 'large' ? 20 : 16} />}
          {children}
        </>
      )}
    </button>
  )
}

/* ---------- text field ---------- */

export function DsTextField({ label, error, trailing, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null; trailing?: ReactNode }) {
  return (
    <label className={cx('flex w-full flex-col items-start', rest.disabled && 'opacity-50', className)}>
      {label && (
        <span className="flex h-[40px] items-center px-[16px] text-[15px] leading-[1.4] text-muted">{label}</span>
      )}
      <span
        className={cx(
          'relative flex h-[44px] w-full items-center gap-[8px] rounded-[14px] bg-surface px-[16px] shadow-[var(--ds-shadow-field)]',
          'border-solid focus-within:border-2 focus-within:border-lime',
          error ? 'border-2 border-danger' : 'border-[0.5px] border-[var(--ds-border-secondary)]',
        )}
      >
        <input {...rest} className="h-full w-full min-w-0 bg-transparent text-[15px] leading-[1.4] text-text outline-none placeholder:text-muted" />
        {trailing}
      </span>
      {error && <span className="px-[16px] pt-[6px] text-[13px] text-danger">{error}</span>}
    </label>
  )
}

/** Кнопка внутри поля (Editing + Button): 28×28 r8, стрелка 24. */
export function DsFieldButton({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" onClick={() => { haptic.tap(); onClick?.() }} className="tap grid h-[28px] w-[28px] shrink-0 place-items-center overflow-hidden rounded-[8px] bg-white text-ink">
      <Icon name="dsArrowRight24" size={24} />
    </button>
  )
}

export function DsTextArea({ label, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className={cx('flex w-full flex-col items-start', className)}>
      {label && <span className="flex h-[40px] items-center px-[16px] text-[15px] leading-[1.4] text-muted">{label}</span>}
      <textarea
        {...rest}
        className="w-full resize-none rounded-[14px] border-[0.5px] border-solid border-[var(--ds-border-secondary)] bg-surface px-[16px] py-[11px] text-[15px] leading-[1.4] text-text shadow-[var(--ds-shadow-field)] outline-none placeholder:text-muted focus:border-2 focus:border-lime"
      />
    </label>
  )
}

/* ---------- Toggle - Switch ---------- */

export function DsToggle({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => { haptic.select(); onChange?.(!on) }}
      className={cx('relative h-[28px] w-[64px] shrink-0 overflow-hidden rounded-[100px] transition-colors', on ? 'bg-accent' : 'bg-[var(--ds-fill-primary)]')}
    >
      <span className={cx('absolute top-[2px] h-[24px] w-[39px] rounded-[100px] bg-white transition-all', on ? 'left-[23px]' : 'left-[2px]')} />
    </button>
  )
}

/* ---------- radio / check ---------- */

export function DsRadio({ active }: { active: boolean }) {
  return <Icon name={active ? 'dsRadioActive' : 'dsCheckDefault'} size={24} className={active ? 'text-accent-2' : 'text-[var(--ds-border-secondary)]'} />
}

export function DsCheck({ active }: { active: boolean }) {
  return <Icon name={active ? 'dsCheckActive' : 'dsCheckDefault'} size={24} className={active ? 'text-accent-2' : 'text-[var(--ds-border-secondary)]'} />
}

/* ---------- icon button ---------- */

export function DsIconButton({ icon, active, onClick, label }: { icon: IconName; active?: boolean; onClick?: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={() => { haptic.tap(); onClick?.() }} className={cx('tap flex items-center p-[6px] text-text', active && 'rounded-full bg-surface-2')}>
      <Icon name={icon} size={24} />
    </button>
  )
}

/* ---------- chat nav bar ---------- */

/** Круглая кнопка nav bar: 44px, bg-transparent, shadow 0 2 8. */
export function DsNavButton({ icon, onClick, label, hidden }: { icon: IconName; onClick?: () => void; label?: string; hidden?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => { haptic.tap(); onClick?.() }}
      className={cx('tap relative h-[44px] w-[44px] shrink-0 rounded-full bg-input text-text shadow-[var(--ds-shadow-8)]', hidden && 'pointer-events-none opacity-0')}
    >
      <Icon name={icon} size={24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </button>
  )
}

export function DsNavBar({ left, title, caret, onTitle, right }: { left?: ReactNode; title?: ReactNode; caret?: boolean; onTitle?: () => void; right?: ReactNode }) {
  return (
    <div className="flex h-[54px] w-full items-center justify-between px-[16px]">
      {left ?? <DsNavButton icon="dsX24" hidden />}
      <button type="button" onClick={onTitle ? () => { haptic.tap(); onTitle() } : undefined} className={cx('flex h-[24px] w-[280px] items-center justify-center pl-[16px]', !onTitle && 'pointer-events-none')}>
        <span className="truncate text-center text-[17px] font-semibold leading-[1.4] text-text">{title}</span>
        {caret && <span className="flex h-full items-center pt-[4px]"><Icon name="dsCaretDown24" size={12} className="mx-[6px] text-text" /></span>}
      </button>
      {right ?? <DsNavButton icon="dsX24" hidden />}
    </div>
  )
}

/* ---------- sheet ---------- */

/** Шторка: контент на скруглённом r44 фрейме с grabber. Используется как обёртка экрана. */
export function DsSheet({ children, onClose, title }: { children: ReactNode; onClose?: () => void; title?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col justify-end bg-black px-[8px] pt-[8px]">
      <div className="flex min-h-[calc(100vh-8px)] w-full flex-col rounded-t-[44px] bg-bg">
        <div className="flex h-[16px] w-full items-center justify-center">
          <span className="h-[5px] w-[36px] rounded-[100px] bg-[var(--ds-border-300)]" />
        </div>
        <DsNavBar left={<DsNavButton icon="dsX24" label="Закрыть" onClick={onClose} />} title={title} />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}

/* ---------- input / composer ---------- */

export function DsComposer({ placeholder, value, onChange, leading = 'dsAdd24', trailing = 'dsMic24', onLeading, onTrailing }: {
  placeholder: string
  value?: string
  onChange?: (v: string) => void
  leading?: IconName
  trailing?: IconName
  onLeading?: () => void
  onTrailing?: () => void
}) {
  return (
    <div className="flex w-full flex-col items-start justify-end overflow-hidden rounded-[26px] bg-input shadow-[var(--ds-shadow-8)]">
      <div className="flex w-full items-center gap-[8px] p-[8px]">
        <DsIconButton icon={leading} onClick={onLeading} />
        <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} className="h-[24px] min-w-0 flex-1 bg-transparent text-[15px] leading-[1.4] text-text outline-none placeholder:text-muted" />
        <DsIconButton icon={trailing} onClick={onTrailing} />
      </div>
    </div>
  )
}

/* ---------- inline card ---------- */

export function DsInlineCard({ label, children, action, className }: { label?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex w-full flex-col items-start gap-[16px]', className)}>
      {label && (
        <div className="flex w-full items-center gap-[12px]">
          <span className="h-[24px] w-[24px] shrink-0 rounded-[5px] border-[0.5px] border-solid border-[var(--ds-border-secondary)] bg-surface" />
          <span className="text-[14px] leading-[19.6px] text-muted">{label}</span>
        </div>
      )}
      <div className="relative w-full overflow-hidden rounded-[16px] bg-surface">
        {children}
        {action && <div className="absolute right-[16px] top-[16px]">{action}</div>}
      </div>
    </div>
  )
}

/** Плавающая круглая кнопка карточки: p8, border .5, shadow 0 2 4. */
export function DsFloatButton({ icon, onClick, label }: { icon: IconName; onClick?: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={() => { haptic.tap(); onClick?.() }} className="tap flex items-center rounded-full border-[0.5px] border-solid border-[var(--ds-border-200)] bg-surface-2 p-[8px] text-text shadow-[var(--ds-shadow-4)]">
      <Icon name={icon} size={24} />
    </button>
  )
}
