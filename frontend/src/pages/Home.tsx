import { useNavigate } from 'react-router'
import { useChannels, useMe, useRecentPayments } from '../api/hooks'
import type { Channel } from '../api/client'
import { ActionCircles, Bone, Carousel, Circle47, ErrorCard, ListCard, ListRow, Money, MoneyHeader, Screen, SectionTitle } from '../components/bonly'
import { Icon } from '../components/Icon'
import { Pill } from '../components/ui'
import { formatMoney, formatShortDate } from '../lib/format'
import { haptic, shareLink } from '../lib/telegram'

/**
 * Главная — скрещение: верх от Revolut (баланс по центру, круги действий на тональной канве),
 * тело от Wise (карусель карточек-каналов, как счета, и лента оплат с подчёркнутой ссылкой «Все»).
 */
export default function Home() {
  const navigate = useNavigate()
  const me = useMe()
  const channels = useChannels()
  const recent = useRecentPayments(5)
  const list = channels.data ?? []
  const first = list[0]
  const balance = me.data?.balance
  const payments = recent.data ?? []

  return (
    <Screen back={false}>
      {me.isPending ? (
        <div className="flex flex-col items-center pt-[36px]">
          <Bone className="h-[14px] w-[130px] rounded-full" />
          <Bone className="mt-[8px] h-[46px] w-[150px] rounded-[12px]" />
          <Bone className="mt-[8px] h-[14px] w-[170px] rounded-full" />
        </div>
      ) : me.error ? (
        <div className="px-[16px] pt-[24px]"><ErrorCard error={me.error} onRetry={() => me.refetch()} /></div>
      ) : (
        <MoneyHeader
          caption="Можно вывести"
          amount={<Money value={balance!.available} />}
          sub={balance!.pending > 0 ? `Ещё ${formatMoney(balance!.pending)} в пути` : `Уже вывели ${formatMoney(balance!.paidOut)}`}
        />
      )}

      <ActionCircles
        className="pt-[24px]"
        actions={[
          { icon: 'upRight2', label: 'Вывести', primary: true, onClick: () => navigate('/payout') },
          { icon: 'plus', label: 'Канал', onClick: () => navigate('/channels/connect') },
          { icon: 'link', label: 'Ссылка', disabled: !first, onClick: () => first && shareLink(first.offerUrl, `Подписка на «${first.title}»`) },
        ]}
      />

      <SectionTitle className="mt-[32px]">Каналы</SectionTitle>
      {channels.isPending ? (
        <Carousel><Bone className="h-[136px] w-[156px] shrink-0 r-card" /><Bone className="h-[136px] w-[156px] shrink-0 r-card" /></Carousel>
      ) : channels.error ? (
        <div className="px-[16px] pt-[10px]"><ErrorCard error={channels.error} onRetry={() => channels.refetch()} /></div>
      ) : (
        <Carousel>
          {list.map((c) => <ChannelCard key={c.id} channel={c} onClick={() => navigate(`/channels/${c.id}`)} />)}
          <button
            onClick={() => { haptic.tap(); navigate('/channels/connect') }}
            className="tap flex h-[136px] w-[156px] shrink-0 snap-start flex-col justify-between r-card p-[16px] text-left ring-1 ring-inset ring-[var(--c-border)]"
          >
            <span className="r-avatar grid h-[40px] w-[40px] place-items-center bg-glass text-text"><Icon name="plus" size={16} /></span>
            <span className="text-[16px] font-semibold leading-[21px] text-text">{list.length === 0 ? 'Подключить канал' : 'Ещё канал'}</span>
          </button>
        </Carousel>
      )}

      <SectionTitle className="mt-[28px]" action={payments.length > 0 ? { label: 'Все', onClick: () => navigate('/stats') } : undefined}>Оплаты</SectionTitle>
      {!recent.isPending && payments.length === 0 ? (
        <p className="mt-[10px] px-[20px] text-pretty text-[15px] leading-[20px] text-muted">
          {first ? 'Пока никто не платил. Отправьте пост подписки в канал.' : 'Подключите канал и создайте подписку, оплаты появятся здесь.'}
        </p>
      ) : (
        <ListCard>
          {recent.isPending ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="flex h-[60px] items-center gap-[12px] px-[16px]">
                <Bone className="h-[40px] w-[40px] rounded-full bg-surface-2" />
                <div className="flex flex-1 flex-col gap-[6px]">
                  <Bone className="h-[12px] w-[96px] rounded-full bg-surface-2" />
                  <Bone className="h-[10px] w-[140px] rounded-full bg-surface-2" />
                </div>
                <Bone className="h-[12px] w-[56px] rounded-full bg-surface-2" />
              </div>
            ))
          ) : (
            payments.map((p, i) => (
              <ListRow
                key={p.id}
                first={i === 0}
                avatar={<Circle47 letter={p.payerName.charAt(0).toUpperCase()} tone="neutral" />}
                title={p.payerName}
                subtitle={`${p.channelTitle} · ${when(p.paidAt)}`}
                trailing={`+${formatMoney(p.net)}`}
              />
            ))
          )}
        </ListCard>
      )}
    </Screen>
  )
}

/** Время для сегодняшних оплат, дата для остальных: строка должна помещаться рядом с названием канала. */
function when(iso: string): string {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : formatShortDate(iso)
}

/** Карточка канала в карусели — как карточка счёта в Wise: аватар, название, крупное число. */
function ChannelCard({ channel: c, onClick }: { channel: Channel; onClick: () => void }) {
  return (
    <button onClick={() => { haptic.tap(); onClick() }} className="tap flex h-[136px] w-[156px] shrink-0 snap-start flex-col justify-between r-card bg-surface p-[16px] text-left">
      <span className="flex w-full items-start justify-between gap-[8px]">
        <Circle47 seed={c.title} letter={c.title.trim().charAt(0).toUpperCase() || '?'} />
        {c.botIssue !== 'none' && <Pill tone="danger" icon={null}>{c.botIssue === 'no_rights' ? 'нет прав' : 'бота нет'}</Pill>}
      </span>
      <span className="min-w-0 w-full">
        <span className="font-display block text-[24px] leading-[28px] tracking-[-0.025em] text-text">{c.activeSubscribers}</span>
        <span className="mt-[1px] block truncate text-[14px] leading-[18px] text-muted">{c.title}</span>
      </span>
    </button>
  )
}
