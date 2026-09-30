import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useChannel, useConnectLink, useDayPaymentsFeed, useDeleteChannel } from '../api/hooks'
import { ActionCircles, Circle108, Circle47, DangerButton, Hero, ListCard, ListRow, Note, Screen, ScreenError, ScreenSkeleton, SectionTitle, Sheet } from '../components/bonly'
import { formatMoney, formatShortDate, plural } from '../lib/format'
import { haptic, openTelegram } from '../lib/telegram'

/**
 * Канал: герой → действия → подписки канала → последние оплаты.
 * Цены и сроки здесь не настраиваются: они живут внутри подписки.
 */
export default function ChannelPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const q = useChannel(id)
  const feed = useDayPaymentsFeed(id, 5)
  const link = useConnectLink()
  const remove = useDeleteChannel(id)
  const [settings, setSettings] = useState(false)

  if (q.isPending) return <ScreenSkeleton />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const { channel, products } = q.data
  const create = () => navigate(`/channels/${id}/products/new`)
  const payments = feed.data ?? []
  const issue = channel.botIssue
  const fix = () => link.data && openTelegram(link.data.url)
  const del = () => remove.mutate(undefined, { onSuccess: () => { haptic.success(); navigate('/', { replace: true }) }, onError: () => haptic.error() })
  const openStats = () => navigate(`/channels/${id}/stats`)

  return (
    <Screen>
      <Hero
        circle={<Circle108 seed={channel.title} letter={channel.title.trim().charAt(0).toUpperCase() || '?'} />}
        title={channel.title}
        subtitle={plural(channel.activeSubscribers, 'подписчик', 'подписчика', 'подписчиков')}
      />

      <ActionCircles
        className="pt-[20px]"
        actions={[
          { icon: 'plus', label: 'Подписка', primary: true, onClick: create },
          { icon: 'chart', label: 'Статистика', onClick: openStats },
          { icon: 'settings', label: 'Настройки', onClick: () => setSettings(true) },
        ]}
      />

      {issue !== 'none' && (
        <>
          <ListCard className="mt-[24px]">
            <ListRow
              first
              avatar={<Circle47 icon="shield" tone="neutral" />}
              title={issue === 'removed' ? 'Бота нет в канале' : 'Боту не хватает прав'}
              subtitle="Продажи стоят, пока не вернёте"
            />
            <ListRow title={issue === 'removed' ? 'Вернуть бота в канал' : 'Открыть Telegram и дать права'} onClick={fix} />
          </ListCard>
          <Note tone="danger">
            {issue === 'removed'
              ? 'Сделайте @PitlyBot админом канала снова. Мы заметим это сами за несколько секунд.'
              : 'В настройках админа включите «Добавление участников» и «Блокировка пользователей».'}
          </Note>
        </>
      )}

      <SectionTitle className="mt-[28px]">Подписки</SectionTitle>
      <ListCard>
        {products.map((p, i) => (
          <ListRow
            key={p.id}
            first={i === 0}
            title={p.title}
            subtitle={p.isActive ? plural(p.activeSubscribers, 'подписчик', 'подписчика', 'подписчиков') : 'Снята с продажи'}
            onClick={() => navigate(`/products/${p.id}`)}
          />
        ))}
        <ListRow first={products.length === 0} avatar={<Circle47 icon="plus" tone="neutral" />} title={products.length === 0 ? 'Создать подписку' : 'Ещё подписка'} chevron={false} onClick={create} />
      </ListCard>

      {payments.length > 0 && (
        <>
          <SectionTitle className="mt-[28px]" action={{ label: 'Все', onClick: openStats }}>Оплаты</SectionTitle>
          <ListCard>
            {payments.map((p, i) => (
              <ListRow
                key={p.id}
                first={i === 0}
                avatar={<Circle47 letter={p.payerName.charAt(0).toUpperCase()} tone="neutral" />}
                title={p.payerName}
                subtitle={`${p.planTitle} · ${formatShortDate(p.paidAt)}`}
                trailing={`+${formatMoney(p.net)}`}
              />
            ))}
          </ListCard>
        </>
      )}

      <Sheet
        open={settings}
        onClose={() => setSettings(false)}
        title={channel.title}
        text="Если удалить канал, продажи остановятся, а бот выйдет из канала. Кто уже оплатил, останется внутри. История оплат сохранится."
      >
        <DangerButton loading={remove.isPending} onClick={del}>Удалить канал</DangerButton>
        {remove.error && <p role="alert" className="px-[4px] text-[13px] leading-[17px] text-danger">{remove.error.message}</p>}
      </Sheet>
    </Screen>
  )
}
