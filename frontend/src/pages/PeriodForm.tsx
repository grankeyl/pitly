import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMe, useProduct, useSavePlan } from '../api/hooks'
import type { Plan } from '../api/client'
import { BottomLime, Chips, ListCard, ListRow, Note, Screen, ScreenError, ScreenSkeleton, SectionTitle, cx } from '../components/bonly'
import { DsToggle } from '../components/ds'
import { formatMoney, formatPeriod, parseRubles } from '../lib/format'
import { PERIODS, PRICE_MAX, PRICE_MIN } from '../lib/product'
import { haptic } from '../lib/telegram'

export default function PeriodForm() {
  const params = useParams()
  const productId = Number(params.productId)
  const planId = params.planId === 'new' ? undefined : Number(params.planId)
  const q = useProduct(productId)

  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />
  const plan = planId ? q.data.plans.find((p) => p.id === planId) : undefined
  if (planId && !plan) return <ScreenError error={new Error('Период не найден')} />

  const taken = q.data.plans.filter((p) => p.id !== planId).map((p) => p.periodDays)
  return <Form productId={productId} plan={plan} taken={taken} />
}

/** Период подписки: цена крупно по центру, срок чипами. Срок, который уже есть у подписки, выбрать нельзя. */
function Form({ productId, plan, taken }: { productId: number; plan?: Plan; taken: number[] }) {
  const navigate = useNavigate()
  const me = useMe()
  const save = useSavePlan(productId)
  const free = PERIODS.filter((d) => !taken.includes(d))
  const [price, setPrice] = useState(plan ? String(plan.price / 100) : '')
  const [period, setPeriod] = useState(plan?.periodDays ?? free[0] ?? 30)
  const [active, setActive] = useState(plan?.isActive ?? true)

  const kopecks = parseRubles(price)
  const priceError = price && (kopecks === null || kopecks < PRICE_MIN || kopecks > PRICE_MAX) ? `От ${formatMoney(PRICE_MIN)} до ${formatMoney(PRICE_MAX)}` : null
  const commission = me.data?.commissionBps ?? 2000
  const net = kopecks ? kopecks - Math.floor((kopecks * commission) / 10000) : 0
  const valid = kopecks !== null && !priceError && !taken.includes(period)

  const submit = () => {
    if (!valid || kopecks === null) return
    save.mutate(
      { id: plan?.id, body: { price: kopecks, periodDays: period, isActive: active } },
      { onSuccess: () => { haptic.success(); navigate(-1) }, onError: () => haptic.error() },
    )
  }

  return (
    <Screen bottom={<BottomLime disabled={!valid} loading={save.isPending} onClick={submit}>{plan ? 'Сохранить' : 'Добавить период'}</BottomLime>}>
      <header className="flex flex-col items-center px-[24px] pt-[28px] text-center">
        <label htmlFor="plan-price" className="text-[14px] leading-[18px] text-text-2">Цена</label>
        {/* Размер задан контейнеру: поле ввода наследует шрифт от родителя */}
        <div className="group font-display tnum mt-[2px] flex items-baseline justify-center gap-[6px] text-[44px] leading-[52px] tracking-[-0.02em]">
          <input
            id="plan-price"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
            placeholder="490"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={!!priceError}
            aria-describedby="plan-price-hint"
            style={{ width: `${Math.max(price.length || 3, 2) + 0.4}ch` }}
            className={cx('bg-transparent text-center outline-none placeholder:text-dim', priceError ? 'text-danger' : 'text-text')}
          />
          <span className="text-muted transition-colors duration-200 group-focus-within:text-accent">₽</span>
        </div>
        <p id="plan-price-hint" role={priceError ? 'alert' : undefined} className={cx('mt-[2px] text-[14px] leading-[18px]', priceError ? 'text-danger' : 'text-muted')}>
          {priceError ?? (kopecks ? `Вам придёт ${formatMoney(net)}, наши ${commission / 100}% уже вычли` : `Мы берём ${commission / 100}%, остальное ваше`)}
        </p>
      </header>

      <SectionTitle className="mt-[28px]">На сколько</SectionTitle>
      <Chips wrap className="mt-[10px]" label="Срок" value={period} onChange={setPeriod} options={PERIODS.filter((d) => d === plan?.periodDays || !taken.includes(d)).map((d) => ({ value: d, label: formatPeriod(d) }))} />
      {taken.length > 0 && <Note>Сроки, которые уже есть у подписки, здесь не показаны.</Note>}

      {plan && (
        <>
          <ListCard className="mt-[20px]">
            <ListRow first title="В продаже" trailing={<DsToggle on={active} onChange={setActive} />} />
          </ListCard>
          <Note>{active ? 'Период видят и могут купить.' : 'Этот период сейчас купить нельзя.'}</Note>
        </>
      )}
      {save.error && <Note tone="danger">{save.error.message}</Note>}
    </Screen>
  )
}
