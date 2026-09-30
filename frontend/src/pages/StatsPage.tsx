import { useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useChannels, useDayPayments, useStats } from '../api/hooks'
import type { Stats } from '../api/client'
import { Bone, ErrorCard, ListCard, ListRow, Money, Screen, SectionTitle, avatarImage, cx } from '../components/bonly'
import { Icon } from '../components/Icon'
import { formatMoney, formatShortDate, plural } from '../lib/format'
import { haptic } from '../lib/telegram'

const PERIODS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
]
const METHOD: Record<string, string> = { sbp: 'СБП', card: 'Карта' }
const CHART_H = 168
const PAD_TOP = 14
const PAD_BOTTOM = 10
const FIRST_DAYS = 7

/** Накопленный итог по дням: линия растёт слева направо и читается как «сколько заработано к этой дате». */
function cumulative(days: Stats['daily']): number[] {
  let sum = 0
  return days.map((d) => (sum += d.net))
}

function path(values: number[], max: number): string {
  const n = values.length
  return values
    .map((v, i) => {
      const x = n > 1 ? (i / (n - 1)) * 100 : 50
      const y = CHART_H - PAD_BOTTOM - (v / max) * (CHART_H - PAD_TOP - PAD_BOTTOM)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * График в духе Stripe и Robinhood: без карточки, по ширине текста страницы.
 * Яркая линия — текущий период, тонкая серая — предыдущий такой же. Палец по графику показывает сумму на дату.
 */
function Chart({ cur, prev, onScrub }: { cur: number[]; prev: number[]; onScrub: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<number | null>(null)
  const max = Math.max(1, cur[cur.length - 1], prev[prev.length - 1] ?? 0)
  const n = cur.length
  const xy = (i: number) => ({
    x: n > 1 ? (i / (n - 1)) * 100 : 50,
    y: CHART_H - PAD_BOTTOM - (cur[i] / max) * (CHART_H - PAD_TOP - PAD_BOTTOM),
  })
  const dot = xy(at ?? n - 1)

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const i = Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))))
    if (i !== at) { haptic.select(); setAt(i); onScrub(i) }
  }
  const stop = () => { setAt(null); onScrub(null) }

  return (
    <div
      ref={box}
      role="img"
      aria-label="График дохода нарастающим итогом: текущий период и предыдущий"
      className="relative mx-[20px] mt-[20px] cursor-crosshair touch-pan-y select-none"
      style={{ height: CHART_H }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX) }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons > 0) move(e.clientX) }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') stop() }}
    >
      <svg aria-hidden viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" className="draw absolute inset-0 h-full w-full overflow-visible">
        {prev.length > 0 && <path d={path(prev, max)} fill="none" className="stroke-text/25" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <path d={path(cur, max)} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {at !== null && <div aria-hidden className="absolute bottom-0 top-0 w-px bg-text/25" style={{ left: `${dot.x}%` }} />}
      <div aria-hidden className="absolute -ml-[6px] -mt-[6px] h-[12px] w-[12px]" style={{ left: `${dot.x}%`, top: dot.y }}><div className="pop-in h-full w-full rounded-full bg-accent ring-[3px] ring-bg" style={{ animationDelay: at === null ? '700ms' : '0ms' }} /></div>
    </div>
  )
}

function DayRow({ date, net, payments, first, channelId }: { date: string; net: number; payments: number; first: boolean; channelId?: number }) {
  const [open, setOpen] = useState(false)
  const q = useDayPayments(date, open, channelId)
  const id = `day-${date}`
  return (
    <>
      {!first && <div className="ml-[16px] h-px bg-separator" />}
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { haptic.tap(); setOpen(!open) }} className="tap flex min-h-[60px] w-full items-center py-[10px] pl-[16px] pr-[12px] text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="text-[16px] font-semibold leading-[21px] text-text">{formatShortDate(date)}</span>
          <span className="text-[14px] leading-[18px] text-muted">{plural(payments, 'оплата', 'оплаты', 'оплат')}</span>
        </span>
        <span className="tnum text-[16px] font-semibold leading-[21px] text-text">{formatMoney(net)}</span>
        <Icon name="v2Chevron" size={18} className={cx('ml-[8px] shrink-0 text-dim transition-transform duration-200', open ? '-rotate-90' : 'rotate-90')} />
      </button>
      <div id={id} className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <ul className="pb-[6px] pl-[16px] pr-[16px]">
            {q.isPending ? (
              Array.from({ length: Math.min(payments, 3) }, (_, i) => <li key={i} className="py-[7px]"><Bone className="h-[34px] rounded-[10px]" /></li>)
            ) : q.error ? (
              <li className="py-[12px] text-[14px] leading-[18px] text-danger">Не загрузилось. Закройте день и откройте снова.</li>
            ) : (
              q.data.map((p) => (
                <li key={p.id} className="flex items-baseline gap-[12px] py-[7px]">
                  <span className="tnum w-[42px] shrink-0 text-[14px] leading-[18px] text-dim">{new Date(p.paidAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-[20px] text-text-2">
                    {p.payerName}
                    <span className="text-muted"> · {channelId ? p.planTitle : p.channelTitle} · {METHOD[p.method] ?? p.method}</span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] leading-[20px] text-text">+{formatMoney(p.net)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </>
  )
}

/**
 * Статистика: канал → сумма и сравнение с прошлым периодом → график во всю ширину → период → подписчики → дни с оплатами.
 * Канал приходит из адреса (?channel=…), поэтому со страницы канала открывается сразу его статистика.
 */
export default function StatsPage() {
  const [params, setParams] = useSearchParams()
  const channels = useChannels()
  const list = channels.data ?? []
  // Со страницы канала статистика открывается отдельным экраном: канал задан адресом, есть кнопка «назад»
  const locked = Number(useParams().id) || undefined
  const raw = locked ?? Number(params.get('channel'))
  const channelId = locked ?? (raw > 0 && list.some((c) => c.id === raw) ? raw : undefined)
  const lockedTitle = locked ? list.find((c) => c.id === locked)?.title : undefined
  const [days, setDays] = useState(30)
  const [all, setAll] = useState(false)
  const [scrub, setScrub] = useState<number | null>(null)
  const q = useStats(days, channelId)
  // Двойное окно нужно только графику: вторая половина — текущий период, первая — предыдущий
  const wide = useStats(days * 2, channelId)

  const { curDays, cur, prev } = useMemo(() => {
    const daily = wide.data?.days === days * 2 ? wide.data.daily : []
    const curDays = daily.length ? daily.slice(-days) : (q.data?.daily ?? [])
    return { curDays, cur: cumulative(curDays), prev: daily.length ? cumulative(daily.slice(0, daily.length - days)) : [] }
  }, [wide.data, q.data, days])

  const withPayments = q.data ? [...q.data.daily].reverse().filter((d) => d.payments > 0) : []
  const visible = all ? withPayments : withPayments.slice(0, FIRST_DAYS)
  const pick = (id?: number) => { haptic.select(); setAll(false); setParams(id ? { channel: String(id) } : {}, { replace: true }) }

  const total = cur.length ? cur[cur.length - 1] : 0
  const prevTotal = prev.length ? prev[prev.length - 1] : 0
  const shown = scrub !== null && cur[scrub] !== undefined ? cur[scrub] : total
  const delta = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null
  const ready = !!q.data && curDays.length > 0

  return (
    <Screen back={!!locked}>
      {locked ? (
        <p className="truncate px-[20px] pt-[20px] text-[15px] font-semibold leading-[20px] text-text">{lockedTitle ?? 'Канал'}</p>
      ) : list.length > 1 && (
        <div role="radiogroup" aria-label="Канал" className="no-scrollbar flex gap-[8px] overflow-x-auto px-[16px] pt-[16px]">
          <button role="radio" aria-checked={!channelId} onClick={() => channelId && pick()} className={cx('tap liquid h-[38px] shrink-0 px-[16px] text-[15px] font-medium leading-[20px]', !channelId ? 'chip-on' : 'liquid-dark')}>
            Все каналы
          </button>
          {list.map((c) => (
            <button key={c.id} ref={channelId === c.id ? (el) => { el?.scrollIntoView({ inline: 'center', block: 'nearest' }) } : undefined} role="radio" aria-checked={channelId === c.id} onClick={() => channelId !== c.id && pick(c.id)} className={cx('tap liquid flex h-[38px] shrink-0 items-center gap-[8px] pl-[6px] pr-[14px] text-[15px] font-medium leading-[20px]', channelId === c.id ? 'chip-on' : 'liquid-dark')}>
              <img src={avatarImage(c.title)} alt="" draggable={false} className="h-[26px] w-[26px] rounded-full object-cover" />
              {c.title}
            </button>
          ))}
        </div>
      )}

      {q.error ? (
        <div className="px-[16px] pt-[24px]"><ErrorCard error={q.error} onRetry={() => q.refetch()} /></div>
      ) : !ready ? (
        <div className="px-[20px] pt-[28px]">
          <Bone className="h-[14px] w-[120px] rounded-full" />
          <Bone className="mt-[8px] h-[44px] w-[190px] rounded-[12px]" />
          <Bone className="mt-[28px] h-[168px] rounded-[16px]" />
        </div>
      ) : (
        <>
          <header className={cx('px-[20px]', locked ? 'pt-[12px]' : 'pt-[28px]')}>
            <p className="text-[14px] leading-[18px] text-text-2">
              {scrub !== null ? `С ${formatShortDate(curDays[0].date)} по ${formatShortDate(curDays[scrub].date)}` : `Заработано за ${plural(days, 'день', 'дня', 'дней')}`}
            </p>
            <p className="font-display tnum mt-[2px] text-[40px] leading-[46px] tracking-[-0.02em] text-text">{scrub !== null ? formatMoney(shown) : <Money value={shown} />}</p>
            <p className="mt-[2px] text-[14px] leading-[18px] text-muted">
              {scrub !== null ? (
                prev[scrub] !== undefined ? `В прошлый раз к этому дню было ${formatMoney(prev[scrub])}` : 'Сравнить пока не с чем'
              ) : delta === null ? (
                total > 0 ? 'До этого оплат не было' : 'За это время никто не платил'
              ) : (
                <>
                  <span className={delta >= 0 ? 'text-green' : 'text-danger'}>На {Math.abs(delta)}% {delta >= 0 ? 'больше' : 'меньше'}</span>, чем за прошлые {plural(days, 'день', 'дня', 'дней')}
                </>
              )}
            </p>
          </header>

          <Chart key={`${days}-${channelId ?? 'all'}`} cur={cur} prev={prev} onScrub={setScrub} />

          <div className="mt-[6px] flex justify-between px-[20px] text-[12px] leading-[15px] text-dim">
            <span>{formatShortDate(curDays[0].date)}</span>
            <span>{formatShortDate(curDays[curDays.length - 1].date)}</span>
          </div>

          <div role="radiogroup" aria-label="Период" className="mt-[14px] flex justify-center gap-[4px] px-[16px]">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                role="radio"
                aria-checked={days === p.value}
                onClick={() => { if (days !== p.value) { haptic.select(); setDays(p.value); setAll(false); setScrub(null) } }}
                className={cx('tap h-[34px] rounded-full px-[16px] text-[14px] font-semibold leading-[18px] transition-colors duration-200', days === p.value ? 'pill-dark text-text' : 'text-muted')}
              >
                {p.label}
              </button>
            ))}
          </div>

          <SectionTitle className="mt-[28px]">Подписчики</SectionTitle>
          <ListCard>
            <ListRow first title="Сейчас подписаны" trailing={q.data!.activeSubscribers} />
            <ListRow title="Новые" trailing={`+${q.data!.newSubscribers}`} />
            <ListRow title="Ушли" trailing={q.data!.churnedSubscribers} />
          </ListCard>

          {withPayments.length > 0 && (
            <>
              <SectionTitle className="mt-[28px]">Оплаты по дням</SectionTitle>
              <div className="r-card mx-[16px] mt-[10px] overflow-hidden bg-surface">
                {visible.map((d, i) => <DayRow key={`${d.date}-${channelId ?? 'all'}`} date={d.date} net={d.net} payments={d.payments} first={i === 0} channelId={channelId} />)}
              </div>
            </>
          )}
          {!all && withPayments.length > FIRST_DAYS && (
            <div className="mt-[10px] flex justify-center">
              <button type="button" onClick={() => { haptic.tap(); setAll(true) }} className="tap pill-dark h-[36px] px-[16px] text-[14px] font-semibold text-text">
                Показать все дни
              </button>
            </div>
          )}
        </>
      )}
    </Screen>
  )
}
