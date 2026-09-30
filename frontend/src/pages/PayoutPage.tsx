import { useState } from 'react'
import { useMe, usePayouts, useRequestPayout } from '../api/hooks'
import type { PayoutMethod } from '../api/client'
import { MethodPicker } from '../components/PayMethods'
import { BottomLime, CardStack, FieldCard, ListCard, ListRow, Money, MoneyHeader, Note, Screen, ScreenError, ScreenSkeleton, SectionTitle } from '../components/bonly'
import { Pill } from '../components/ui'
import { formatMoney, formatShortDate, parseRubles } from '../lib/format'
import { haptic } from '../lib/telegram'

const METHOD: Record<PayoutMethod, { title: string; label: string; placeholder: string; inputMode: 'numeric' | 'tel' | 'text' }> = {
  sbp: { title: 'СБП', label: 'Телефон для СБП', placeholder: '+7 999 123-45-67', inputMode: 'tel' },
  card: { title: 'Карта', label: 'Номер карты', placeholder: '2200 0000 0000 0000', inputMode: 'numeric' },
  usdt_ton: { title: 'USDT · TON', label: 'Адрес кошелька TON', placeholder: 'UQ…', inputMode: 'text' },
}
const STATUS: Record<string, { label: string; tone: 'dark' | 'blue' | 'green' | 'danger' }> = {
  requested: { label: 'ждёт', tone: 'dark' },
  processing: { label: 'отправляем', tone: 'blue' },
  paid: { label: 'выплачено', tone: 'green' },
  rejected: { label: 'отклонено', tone: 'danger' },
}

/** Вывод — шаблон «деньги»: сумма слева → способ чипами → сумма и реквизиты → условия → история → кнопка. */
export default function PayoutPage() {
  const me = useMe()
  const payouts = usePayouts()
  const request = useRequestPayout()
  const [method, setMethod] = useState<PayoutMethod>('sbp')
  const [amount, setAmount] = useState('')
  const [dest, setDest] = useState('')

  if (me.isPending) return <ScreenSkeleton hero={false} />
  if (me.error) return <ScreenError error={me.error} onRetry={() => me.refetch()} />

  const { balance, minPayout, holdHours, payoutMethods } = me.data
  const current = payoutMethods.includes(method) ? method : payoutMethods[0]
  const kopecks = parseRubles(amount)
  const amountError =
    amount === '' ? null
    : kopecks === null ? 'Сколько вывести?'
    : kopecks < minPayout ? `Минимум ${formatMoney(minPayout)}`
    : kopecks > balance.available ? `Доступно ${formatMoney(balance.available)}`
    : null
  const valid = kopecks !== null && !amountError && dest.trim().length >= 4

  const submit = () => {
    if (!valid || kopecks === null) return
    request.mutate({ amount: kopecks, method: current, destination: dest.trim() }, { onSuccess: () => { haptic.success(); setAmount(''); setDest('') }, onError: () => haptic.error() })
  }

  return (
    <Screen bottom={<BottomLime disabled={!valid} loading={request.isPending} onClick={submit}>Вывести{kopecks && !amountError ? ` ${formatMoney(kopecks)}` : ''}</BottomLime>}>
      <MoneyHeader caption="Можно вывести" amount={<Money value={balance.available} />} sub={balance.pending > 0 ? `Ещё ${formatMoney(balance.pending)} в пути, придут в течение ${holdHours} ч` : `Вывести можно от ${formatMoney(minPayout)}`} />

      <MethodPicker kind="payout" className="mt-[20px]" label="Куда вывести" value={current} onChange={(m) => { setMethod(m); setDest('') }} options={payoutMethods} />

      <CardStack className="mt-[12px]">
        <FieldCard
          label="Сумма, ₽"
          value={amount}
          onChange={setAmount}
          placeholder={String(Math.floor(balance.available / 100))}
          inputMode="decimal"
          error={amountError}
          trailing={balance.available > 0 ? <button type="button" onClick={() => setAmount(String(balance.available / 100))} className="tap pill-dark h-[32px] px-[12px] text-[14px] font-semibold text-text">Всё</button> : undefined}
        />
        <FieldCard label={METHOD[current].label} value={dest} onChange={setDest} placeholder={METHOD[current].placeholder} inputMode={METHOD[current].inputMode} />
      </CardStack>
      {request.error && <Note tone="danger">{request.error.message}</Note>}
      {request.isSuccess && <Note tone="lime">Готово, деньги скоро придут.</Note>}

      <SectionTitle className="mt-[28px]">Условия</SectionTitle>
      <ListCard>
        <ListRow first title="Деньги можно вывести через" subtitle="После каждой оплаты" trailing={`${holdHours} ч`} />
        <ListRow title="Минимум на вывод" trailing={formatMoney(minPayout)} />
        <ListRow title="Всего вывели" trailing={formatMoney(balance.paidOut)} />
      </ListCard>

      {payouts.data && payouts.data.length > 0 && (
        <>
          <SectionTitle className="mt-[28px]">История</SectionTitle>
          <ListCard>
            {payouts.data.map((p, i) => (
              <ListRow
                key={p.id}
                first={i === 0}
                title={formatMoney(p.amount, p.currency)}
                subtitle={`${METHOD[p.method].title} · ${formatShortDate(p.createdAt)}`}
                trailing={<Pill tone={STATUS[p.status]?.tone ?? 'dark'} icon={null}>{STATUS[p.status]?.label ?? p.status}</Pill>}
              />
            ))}
          </ListCard>
        </>
      )}
    </Screen>
  )
}
