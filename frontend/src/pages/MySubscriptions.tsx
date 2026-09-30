import { useNavigate } from 'react-router'
import { useMySubscriptions } from '../api/hooks'
import { Circle47, ListCard, ListRow, PageTitle, Screen, ScreenError, ScreenSkeleton, SectionTitle } from '../components/bonly'
import { Pill } from '../components/ui'
import { formatShortDate, plural } from '../lib/format'
import { openTelegram } from '../lib/telegram'

/** Мои подписки — шаблон «задача»: заголовок → активные → истёкшие; пустое состояние объясняет, как подписаться. */
export default function MySubscriptions() {
  const navigate = useNavigate()
  const q = useMySubscriptions()

  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const active = q.data.filter((s) => s.status === 'active')
  const expired = q.data.filter((s) => s.status !== 'active')
  const letter = (t: string) => t.trim().charAt(0).toUpperCase() || '?'

  return (
    <Screen>
      <PageTitle title="Мои подписки" sub={q.data.length ? `${plural(active.length, 'активная', 'активные', 'активных')} из ${q.data.length}` : 'Тут будут каналы, на которые вы подписались.'} />

      {q.data.length === 0 && (
        <ListCard className="mt-[20px]">
          <ListRow first avatar={<Circle47 letter="1" />} title="Откройте ссылку от автора" subtitle="Она приведёт сюда" />
          <ListRow avatar={<Circle47 letter="2" />} title="Оплатите СБП или картой" subtitle="Бот сразу пустит вас в канал" />
        </ListCard>
      )}

      {active.length > 0 && (
        <>
          <SectionTitle className="mt-[28px]">Активные</SectionTitle>
          <ListCard>
            {active.map((s, i) => (
              <ListRow
                key={s.id}
                first={i === 0}
                avatar={<Circle47 seed={s.channelTitle} letter={letter(s.channelTitle)} />}
                title={s.channelTitle}
                subtitle={`${s.planTitle} · ${s.expiresAt ? `до ${formatShortDate(s.expiresAt)}` : 'навсегда'}`}
                onClick={() => (s.inviteLink ? openTelegram(s.inviteLink) : navigate(`/offer/${s.channelId}`))}
              />
            ))}
          </ListCard>
        </>
      )}
      {expired.length > 0 && (
        <>
          <SectionTitle className="mt-[28px]">Закончились</SectionTitle>
          <ListCard>
            {expired.map((s, i) => (
              <ListRow
                key={s.id}
                first={i === 0}
                avatar={<Circle47 letter={letter(s.channelTitle)} tone="neutral" />}
                title={s.channelTitle}
                subtitle={s.expiresAt ? `Закончилась ${formatShortDate(s.expiresAt)}` : 'Закончилась'}
                trailing={<Pill tone="dark" icon={null}>продлить</Pill>}
                chevron={false}
                onClick={() => navigate(`/offer/${s.channelId}`)}
              />
            ))}
          </ListCard>
        </>
      )}
    </Screen>
  )
}
