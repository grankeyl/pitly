import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { keys, usePayment } from '../api/hooks'
import { BottomLime, Circle108, Hero, ListCard, ListRow, Screen, ScreenError } from '../components/bonly'
import { Spinner } from '../components/ui'
import { formatMoney } from '../lib/format'
import { haptic, openTelegram } from '../lib/telegram'

/** Статус платежа — шаблон «объект»: круг состояния → заголовок → что дальше → кнопка. */
export default function PaymentStatus() {
  const paymentId = useParams().paymentId!
  const navigate = useNavigate()
  const qc = useQueryClient()
  const q = usePayment(paymentId, true)
  const status = q.data?.status

  useEffect(() => {
    if (status === 'succeeded') {
      haptic.success()
      qc.invalidateQueries({ queryKey: keys.subscriptions })
      if (q.data) qc.invalidateQueries({ queryKey: keys.offer(q.data.channelId) })
    }
    if (status === 'failed') haptic.error()
  }, [status, qc, q.data])

  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const p = q.data
  const pending = !p || p.status === 'pending'
  const ok = p?.status === 'succeeded'

  return (
    <Screen
      bottom={
        ok && p.inviteLink ? <BottomLime onClick={() => openTelegram(p.inviteLink!)}>Вступить в канал</BottomLime>
        : ok ? <BottomLime onClick={() => navigate('/subscriptions', { replace: true })}>Мои подписки</BottomLime>
        : !pending && p ? <BottomLime onClick={() => navigate(`/offer/${p.channelId}`, { replace: true })}>Попробовать снова</BottomLime>
        : undefined
      }
    >
      <Hero
        circle={pending ? <div className="r-hero grid h-[72px] w-[72px] place-items-center bg-glass text-text"><Spinner /></div> : <Circle108 icon={ok ? 'check' : 'close'} tone={ok ? 'accent' : 'neutral'} />}
        title={pending ? 'Ждём оплату' : ok ? 'Оплата прошла' : 'Оплата не прошла'}
        subtitle={p ? `${formatMoney(p.amount, p.currency)} · ${p.channelTitle}` : 'Секунду'}
      />

      <ListCard className="mt-[24px]">
        {pending && <ListRow first title="Оплатите на открывшейся странице" subtitle="Этот экран обновится сам" />}
        {ok && <ListRow first title={p.inviteLink ? 'Вступите в канал' : 'Бот пришлёт ссылку'} subtitle="Бот пустит вас сразу" onClick={p.inviteLink ? () => openTelegram(p.inviteLink!) : undefined} />}
        {!pending && !ok && p && <ListRow first title="Деньги не списались" subtitle="Попробуйте другим способом" />}
      </ListCard>
    </Screen>
  )
}
