/*
 * Компоненты тёмной темы из примеров MCP Apps (Figma 58iOTmm2GKKw73SReWHu79, node 1:2845):
 * «navigation» 1:2854, «new chat» 1:2863, «chat» 1:2872. Значения — из get_design_context,
 * цвета тёмного режима — с рендера Figma (get_screenshot) и из SVG-ассетов.
 *
 *   sidebar: w340 bg #1F1E1D; wordmark row h56 pl24 py12, search-24 справа 16/16; list row small h44 px24,
 *     icon 24 + text 17 (gap 16); selected tint #000 r14 w324; header h40 pl24 pr16 text 15 muted;
 *     «All Chats ›» h44 text 15 muted + chevron; низ: pill 140×48 #30302E (avatar 32 #000, initials 15, name 13)
 *     + круглая 48 #D97757 с иконкой 24; pb34 px16 pt8
 *   chat nav bar: h54 px16, круги 44 rgba(48,48,46,.6) shadow 0 2 8 .08, title 17 Semibold + caret, details 13 muted
 *   greeting: icon 43 + serif 28 lh1.3 w261 центр, gap 11
 *   input (composer): w370 r24 bg rgba(48,48,46,.6) shadow 0 2 8 .16; text field h48 px16 py12 text 15 muted;
 *     button row px8 py8: plus p6 | mic p6 + voice 36 круг #FAF9F5 icon 24
 *   user message: bg #30302E r24 px16 py14 text 15, max-w 312, справа; gap 5, px16
 *   response: serif 17 lh22 tracking -0.25 px16; output controls h44 p16 gap8 icons 24; signature h44 px16
 */
import type { ReactNode } from 'react'
import { haptic } from '../lib/telegram'
import { Icon, type IconName } from './Icon'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/* ---------- chat nav bar (dark) ---------- */

export function NavCircle({ icon, onClick, label, accent, hidden }: { icon: IconName; onClick?: () => void; label?: string; accent?: boolean; hidden?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => { haptic.tap(); onClick?.() }}
      className={cx('tap relative h-[44px] w-[44px] shrink-0 rounded-full shadow-[0_2px_8px_0_rgb(0_0_0/0.08)]', accent ? 'bg-accent text-white' : 'bg-input text-text', hidden && 'pointer-events-none opacity-0')}
    >
      <Icon name={icon} size={accent ? 20 : 24} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </button>
  )
}

export function ChatNavBar({ left, title, details, onTitle, right }: { left: ReactNode; title: string; details?: string; onTitle?: () => void; right: ReactNode }) {
  return (
    <div className="flex h-[54px] w-full items-center justify-between px-[16px]">
      {left}
      <button type="button" onClick={onTitle ? () => { haptic.tap(); onTitle() } : undefined} className={cx('flex h-[24px] w-[280px] flex-col items-center justify-center', !onTitle && 'pointer-events-none')}>
        <span className="flex items-center text-[17px] font-semibold leading-[1.4] text-text">
          {title}
          {onTitle && <Icon name="dkCaret" size={12} className="ml-[8px] text-text" />}
        </span>
        {details && <span className="text-[13px] leading-[1.4] text-muted">{details}</span>}
      </button>
      {right}
    </div>
  )
}

/* ---------- greeting ---------- */

export function Greeting({ icon, children, sub }: { icon?: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-[11px] text-center">
      {icon}
      <p className="font-serif w-[261px] text-[28px] leading-[1.3] text-text">{children}</p>
      {sub && <p className="text-[15px] leading-[1.4] text-muted">{sub}</p>}
    </div>
  )
}

/* ---------- list row small / header / all ---------- */

export function ListRowSmall({ icon, children, selected, onClick, trailing }: { icon?: IconName; children: ReactNode; selected?: boolean; onClick?: () => void; trailing?: ReactNode }) {
  return (
    <div onClick={onClick ? () => { haptic.tap(); onClick() } : undefined} className={cx('relative flex h-[44px] w-full items-center gap-[10px] px-[24px]', onClick && 'tap cursor-pointer')}>
      {selected && <span className="absolute left-1/2 top-1/2 h-[44px] w-[calc(100%-16px)] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-selected" />}
      <div className="relative flex min-w-0 flex-1 items-center gap-[16px]">
        {icon && <Icon name={icon} size={24} className="text-text" />}
        <span className="truncate text-[17px] leading-[1.4] text-text">{children}</span>
      </div>
      {trailing && <span className="relative shrink-0">{trailing}</span>}
    </div>
  )
}

export function ListHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[40px] w-full items-center pl-[24px] pr-[16px]">
      <span className="text-[15px] leading-[1.4] text-muted">{children}</span>
    </div>
  )
}

export function ListMore({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={() => { haptic.tap(); onClick?.() }} className="tap flex h-[44px] w-full items-center px-[24px]">
      <span className="flex h-[24px] items-center gap-[4px]">
        <span className="text-[15px] leading-[1.4] text-muted">{children}</span>
        <Icon name="chevronR" size={10} className="ml-[8px] text-muted" />
      </span>
    </button>
  )
}

/* ---------- composer (input) ---------- */

export function Composer({ placeholder, value, onChange, onSubmit, leftIcon = 'dkPlus', onLeft, rightIcon = 'dkVoice', onRight }: {
  placeholder: string
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  leftIcon?: IconName
  onLeft?: () => void
  rightIcon?: IconName
  onRight?: () => void
}) {
  return (
    <div className="flex w-full flex-col items-start justify-end overflow-hidden rounded-[24px] bg-input shadow-[0_2px_8px_0_rgb(0_0_0/0.16)]">
      <div className="flex h-[48px] w-full items-center px-[16px] py-[12px]">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.() }}
          placeholder={placeholder}
          className="h-[24px] w-full bg-transparent text-[15px] leading-[1.4] text-text outline-none placeholder:text-muted"
        />
      </div>
      <div className="flex w-full items-center justify-between px-[8px] pb-[8px] pt-[8px]">
        <button type="button" onClick={() => { haptic.tap(); onLeft?.() }} className="tap flex items-center justify-center rounded-[79px] p-[6px] text-text"><Icon name={leftIcon} size={24} /></button>
        <div className="flex items-center gap-[4px]">
          <button type="button" className="flex items-center justify-center rounded-[79px] p-[6px] text-muted"><Icon name="dkMic" size={24} /></button>
          <button type="button" onClick={() => { haptic.tap(); (onRight ?? onSubmit)?.() }} className="tap flex h-[36px] w-[36px] items-center justify-center overflow-hidden rounded-[18px] bg-text text-bg"><Icon name={rightIcon} size={24} /></button>
        </div>
      </div>
    </div>
  )
}

/* ---------- messages ---------- */

export function UserMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col items-end gap-[5px] px-[16px]">
      <div className="max-w-[312px] rounded-[24px] bg-surface-2 px-[16px] py-[14px] text-[15px] leading-[1.4] text-text">{children}</div>
    </div>
  )
}

export function ResponseText({ children }: { children: ReactNode }) {
  return <div className="font-serif w-full px-[16px] text-[17px] leading-[22px] tracking-[-0.25px] text-text">{children}</div>
}

export function OutputControls({ actions }: { actions: { icon: IconName; label: string; onClick?: () => void }[] }) {
  return (
    <div className="flex h-[44px] w-full items-center gap-[8px] p-[16px]">
      {actions.map((a) => (
        <button key={a.label} type="button" aria-label={a.label} onClick={() => { haptic.tap(); a.onClick?.() }} className="tap grid h-[24px] w-[24px] place-items-center text-muted">
          <Icon name={a.icon} size={16} />
        </button>
      ))}
    </div>
  )
}

/* ---------- sidebar ---------- */

export function SidebarPill({ initials, name, onClick }: { initials: string; name: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={() => { haptic.tap(); onClick?.() }} className="tap relative h-[48px] w-[140px] rounded-[24px] bg-surface-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
      <span className="absolute left-[8px] top-[8px] grid h-[32px] w-[32px] place-items-center overflow-hidden rounded-full bg-selected text-[15px] font-medium leading-[20px] tracking-[-0.225px] text-text">{initials}</span>
      <span className="absolute left-[48px] top-1/2 max-w-[84px] -translate-y-1/2 truncate text-left text-[13px] leading-[1.4] text-text">{name}</span>
    </button>
  )
}

export function SidebarAccentButton({ icon = 'settingsOrange', onClick, label }: { icon?: IconName; onClick?: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={() => { haptic.tap(); onClick?.() }} className="tap relative h-[48px] w-[48px] rounded-full bg-accent drop-shadow-[0_2px_4px_rgba(0,0,0,0.08)] shadow-[inset_-0.5px_-0.5px_0.5px_0_rgba(255,255,255,0.5),inset_0.5px_0.5px_0.5px_0_rgba(255,255,255,0.5)]">
      <Icon name={icon} size={20} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white" />
    </button>
  )
}

/** Выдвижной сайдбар 340px поверх контента (как экран «navigation»). */
export function Sidebar({ open, onClose, wordmark, onSearch, children, footer }: { open: boolean; onClose: () => void; wordmark: ReactNode; onSearch?: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div onClick={onClose} className={cx('fixed inset-0 z-40 bg-black/40 transition-opacity', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <aside className={cx('fixed inset-y-0 left-0 z-50 flex w-[340px] max-w-[86vw] flex-col bg-surface transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="relative flex h-[56px] items-center gap-[4px] pl-[24px] py-[12px] pt-[calc(env(safe-area-inset-top)+12px)]">
          {wordmark}
          {onSearch && (
            <button type="button" aria-label="Поиск" onClick={() => { haptic.tap(); onSearch() }} className="tap absolute right-[16px] top-[16px] grid h-[24px] w-[24px] place-items-center text-text">
              <Icon name="search24" size={24} />
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto pt-[50px]">{children}</div>
        <div className="flex items-center justify-between px-[16px] pb-[calc(var(--safe-bottom)+34px)] pt-[8px]">{footer}</div>
      </aside>
    </>
  )
}
