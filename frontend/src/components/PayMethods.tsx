import type { ReactNode } from 'react'
import { SelectMark, cx } from './bonly'
import { haptic } from '../lib/telegram'
import sbp from '../assets/pay/sbp.svg'
import mir from '../assets/pay/mir.svg'
import visa from '../assets/pay/visa.svg'
import mastercard from '../assets/pay/mastercard.svg'
import usdt from '../assets/pay/usdt.svg'
import ton from '../assets/pay/ton.svg'

/*
 * Способы оплаты и вывода блоками с логотипами.
 * Логотипы — официальные знаки платёжных систем (файлы с Wikimedia Commons), цвета не меняются.
 * Знаки стоят на белой плашке: у большинства тёмные детали, на тёмной карточке они пропадают.
 */
export type MethodKey = 'sbp' | 'card' | 'usdt_ton'

const INFO: Record<MethodKey, { title: string; pay: string; payout: string; logos: { src: string; alt: string; wide?: boolean }[] }> = {
  sbp: { title: 'СБП', pay: 'Приложение банка', payout: 'По номеру телефона', logos: [{ src: sbp, alt: 'СБП' }] },
  card: {
    title: 'Карта',
    pay: 'МИР, Visa, Mastercard',
    payout: 'На карту любого банка',
    logos: [{ src: mir, alt: 'МИР', wide: true }, { src: visa, alt: 'Visa', wide: true }, { src: mastercard, alt: 'Mastercard' }],
  },
  usdt_ton: { title: 'USDT', pay: 'В сети TON', payout: 'На кошелёк в сети TON', logos: [{ src: usdt, alt: 'USDT' }, { src: ton, alt: 'TON' }] },
}

export const methodTitle = (m: MethodKey) => INFO[m].title

function Logo({ src, alt, wide }: { src: string; alt: string; wide?: boolean }) {
  return (
    <span className={cx('grid h-[26px] shrink-0 place-items-center rounded-[7px] bg-white', wide ? 'w-[38px] px-[5px]' : 'w-[30px] px-[4px]')}>
      <img src={src} alt={alt} draggable={false} className="max-h-[17px] max-w-full object-contain" />
    </span>
  )
}

function Block({ m, on, onClick, role, kind, row }: { m: MethodKey; on: boolean; onClick: () => void; role: 'radio' | 'checkbox'; kind: 'pay' | 'payout'; row?: boolean }) {
  const info = INFO[m]
  // Три способа и больше не помещаются плитками на телефоне — идут строками во всю ширину
  if (row) {
    return (
      <button
        type="button"
        role={role}
        aria-checked={on}
        onClick={onClick}
        className={cx('tap r-card flex min-h-[64px] items-center gap-[12px] py-[10px] pl-[14px] pr-[14px] text-left transition-colors duration-200', on ? 'bg-surface-2' : 'bg-surface')}
      >
        <span className="flex w-[64px] shrink-0 gap-[3px]">{info.logos.slice(0, 2).map((l) => <Logo key={l.alt} {...l} wide={false} />)}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="truncate text-[16px] font-semibold leading-[21px] text-text">{info.title}</span>
          <span className="truncate text-[13px] leading-[17px] text-muted">{info[kind]}</span>
        </span>
        <SelectMark on={on} />
      </button>
    )
  }
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cx('tap r-card flex min-h-[112px] flex-col p-[14px] text-left transition-colors duration-200', on ? 'bg-surface-2' : 'bg-surface')}
    >
      <span className="flex w-full items-start justify-between gap-[8px]">
        <span className="flex gap-[3px]">{info.logos.map((l) => <Logo key={l.alt} {...l} />)}</span>
        <SelectMark on={on} />
      </span>
      <span className="mt-auto pt-[14px] text-[16px] font-semibold leading-[21px] text-text">{info.title}</span>
      <span className="text-[13px] leading-[17px] text-muted">{info[kind]}</span>
    </button>
  )
}

const grid = (n: number, className?: string) => cx('grid gap-[8px] px-[16px]', n >= 3 ? 'grid-cols-1' : 'grid-cols-2', className)

/** Один способ из нескольких. */
export function MethodPicker<T extends MethodKey>({ options, value, onChange, label, kind = 'pay', className }: {
  options: T[]; value: T; onChange: (v: T) => void; label: string; kind?: 'pay' | 'payout'; className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={grid(options.length, className)}>
      {options.map((m) => <Block key={m} m={m} kind={kind} row={options.length >= 3} role="radio" on={m === value} onClick={() => { if (m !== value) { haptic.select(); onChange(m) } }} />)}
    </div>
  )
}

/** Несколько способов сразу; последний выбранный снять нельзя. */
export function MethodMulti<T extends MethodKey>({ options, value, onChange, label, className, hint }: {
  options: T[]; value: T[]; onChange: (v: T[]) => void; label: string; className?: string; hint?: ReactNode
}) {
  return (
    <>
      <div role="group" aria-label={label} className={grid(options.length, className)}>
        {options.map((m) => {
          const on = value.includes(m)
          return (
            <Block
              key={m}
              m={m}
              kind="pay"
              row={options.length >= 3}
              role="checkbox"
              on={on}
              onClick={() => {
                if (on && value.length <= 1) { haptic.error(); return }
                haptic.select()
                onChange(on ? value.filter((v) => v !== m) : [...value, m])
              }}
            />
          )
        })}
      </div>
      {hint}
    </>
  )
}
