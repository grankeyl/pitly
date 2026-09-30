import { useLocation, useNavigate, useParams } from 'react-router'
import { useOfferMethods, useProduct, useUpdateProduct } from '../api/hooks'
import { BottomLime, Circle47, ListCard, ListRow, Note, PageTitle, Screen, ScreenError, ScreenSkeleton, SectionTitle } from '../components/bonly'
import { DsToggle } from '../components/ds'
import { methodTitle } from '../components/PayMethods'
import { formatMoney } from '../lib/format'
import { productBody } from '../lib/product'
import { haptic } from '../lib/telegram'

/**
 * Настройки подписки одним экраном: детали и способы оплаты строками, ниже — периоды с ценами.
 * Каждая строка открывает свой маленький экран; сохраняется сразу там.
 */
export default function ProductEdit() {
  const id = Number(useParams().productId)
  const navigate = useNavigate()
  const q = useProduct(id)
  const methods = useOfferMethods()
  const update = useUpdateProduct(id)
  // Сразу после создания «Готово» ведёт на страницу подписки, откуда её отправляют в канал
  const fresh = (useLocation().state as { fresh?: boolean } | null)?.fresh === true

  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const p = q.data
  const chosen = p.paymentMethods.length > 0 ? p.paymentMethods : methods
  const toggle = (on: boolean) => update.mutate(productBody(p, { isActive: on }), { onSuccess: () => haptic.success(), onError: () => haptic.error() })

  return (
    <Screen bottom={<BottomLime onClick={() => (fresh ? navigate(`/products/${id}`, { replace: true }) : navigate(-1))}>Готово</BottomLime>}>
      <PageTitle title="Настройки подписки" sub={fresh ? 'Подписка создана. Проверьте цену и срок.' : undefined} />

      <ListCard className="mt-[16px]">
        <ListRow first title="Детали" subtitle={[p.title, p.description].filter(Boolean).join(' · ')} onClick={() => navigate(`/products/${id}/details`)} />
        <ListRow title="Способы оплаты" subtitle={chosen.map(methodTitle).join(', ')} onClick={() => navigate(`/products/${id}/methods`)} />
      </ListCard>

      <ListCard className="mt-[8px]">
        <ListRow first title="В продаже" trailing={<DsToggle on={p.isActive} onChange={toggle} />} />
      </ListCard>
      <Note>{p.isActive ? 'Подписку видят и могут купить.' : 'Сейчас подписку никто не видит. Кто уже оплатил, остаётся в канале.'}</Note>
      {update.error && <Note tone="danger">{update.error.message}</Note>}

      <SectionTitle className="mt-[28px]">Периоды</SectionTitle>
      <ListCard>
        {p.plans.map((plan, i) => (
          <ListRow
            key={plan.id}
            first={i === 0}
            title={plan.title}
            subtitle={plan.isActive ? undefined : 'Снят с продажи'}
            trailing={formatMoney(plan.price, plan.currency)}
            onClick={() => navigate(`/products/${id}/plans/${plan.id}`)}
          />
        ))}
        <ListRow first={p.plans.length === 0} avatar={<Circle47 icon="plus" tone="neutral" />} title={p.plans.length === 0 ? 'Добавить период' : 'Добавить ещё период'} chevron={false} onClick={() => navigate(`/products/${id}/plans/new`)} />
      </ListCard>
      <Note>Новые цены действуют для новых оплат. Кто уже подписан, доживает свой срок по старой.</Note>
    </Screen>
  )
}
