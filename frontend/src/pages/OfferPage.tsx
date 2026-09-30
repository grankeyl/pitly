import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAnyOffer, useCheckout } from '../api/hooks'
import type { PaymentMethod } from '../api/client'
import { MethodPicker } from '../components/PayMethods'
import { BottomLime, Card82, CardStack, Circle108, Hero, ListCard, ListRow, Note, Screen, ScreenError, ScreenSkeleton, SectionTitle } from '../components/bonly'
import { formatDate, formatMoney } from '../lib/format'
import { haptic, openExternal, openTelegram } from '../lib/telegram'


/** Оплата: герой канала → картинка подписки → сроки карточками выбора → способ оплаты → кнопка с суммой. */
export default function OfferPage() {
  const params = useParams()
  const navigate = useNavigate()
  const offer = useAnyOffer(params.productId ? { productId: Number(params.productId) } : { channelId: Number(params.channelId) })
  const checkout = useCheckout()
  const [planId, setPlanId] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod | null>(null)

  if (offer.isPending) return <ScreenSkeleton />
  if (offer.error) return <ScreenError error={offer.error} onRetry={() => offer.refetch()} />

  const o = offer.data
  const selectedPlan = o.plans.find((p) => p.id === (planId ?? o.plans[0]?.id))
  const methods = [...o.paymentMethods].sort((a, b) => (a === 'sbp' ? -1 : b === 'sbp' ? 1 : 0))
  const selectedMethod = method && methods.includes(method) ? method : methods[0]
  const sub = o.subscription
  const active = sub?.status === 'active'

  const pay = () => {
    if (!selectedPlan || !selectedMethod) return
    checkout.mutate(
      { planId: selectedPlan.id, method: selectedMethod },
      { onSuccess: (res) => { openExternal(res.paymentUrl); navigate(`/payment/${res.paymentId}`) }, onError: () => haptic.error() },
    )
  }

  return (
    <Screen
      fallback={o.own && o.productId ? `/products/${o.productId}` : '/'}
      bottom={
        o.own ? (
          o.productId ? <BottomLime onClick={() => navigate(`/products/${o.productId}`)}>Открыть подписку</BottomLime> : undefined
        ) : o.available && selectedPlan ? (
          <BottomLime loading={checkout.isPending} onClick={pay}>{active ? 'Продлить' : 'Оплатить'} {formatMoney(selectedPlan.price, selectedPlan.currency)}</BottomLime>
        ) : undefined
      }
    >
      <Hero
        circle={<Circle108 seed={o.title} letter={o.title.trim().charAt(0).toUpperCase()} />}
        title={o.title}
        subtitle={active && sub ? (sub.expiresAt ? `Подписка до ${formatDate(sub.expiresAt)}` : 'Подписка навсегда') : o.description || 'Закрытый канал'}
      />

      {o.imageUrl && <img src={o.imageUrl} alt="" draggable={false} className="r-card mx-[16px] mt-[20px] block max-h-[200px] w-[calc(100%-32px)] object-cover" />}

      {active && sub?.inviteLink && (
        <ListCard className="mt-[20px]">
          <ListRow first title="Открыть канал" subtitle="Подписка работает" onClick={() => openTelegram(sub.inviteLink!)} />
        </ListCard>
      )}

      {!o.available ? (
        <ListCard className="mt-[20px]"><ListRow first title="Сейчас оплатить нельзя" subtitle="Автор пока не принимает подписки" /></ListCard>
      ) : (
        <>
          <SectionTitle className="mt-[28px]">{o.productTitle ?? (active ? 'Продлить' : 'Выберите срок')}</SectionTitle>
          <CardStack>
            {o.plans.map((p) => (
              <Card82
                key={p.id}
                title={p.title}
                trailing={formatMoney(p.price, p.currency)}
                chevron={false}
                selected={p.id === selectedPlan?.id}
                onClick={() => setPlanId(p.id)}
              />
            ))}
          </CardStack>

          {methods.length > 1 && selectedMethod && (
            <>
              <SectionTitle className="mt-[28px]">Как заплатить</SectionTitle>
              <MethodPicker className="mt-[10px]" label="Способ оплаты" value={selectedMethod} onChange={setMethod} options={methods} />
            </>
          )}
          {!o.own && <Note>Сразу после оплаты бот пустит вас в канал.</Note>}
          {!o.own && (
            <p className="mt-[8px] px-[20px] text-pretty text-[13px] leading-[17px] text-dim">
              Оплачивая, вы принимаете{' '}
              <button type="button" onClick={() => navigate('/legal/offer')} className="cursor-pointer text-text-2 underline underline-offset-2">оферту</button>
              {' '}и{' '}
              <button type="button" onClick={() => navigate('/legal/privacy')} className="cursor-pointer text-text-2 underline underline-offset-2">политику конфиденциальности</button>.
            </p>
          )}
          {checkout.error && <Note tone="danger">{checkout.error.message}</Note>}
        </>
      )}
    </Screen>
  )
}
