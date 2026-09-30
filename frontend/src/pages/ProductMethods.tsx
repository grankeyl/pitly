import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useOfferMethods, useProduct, useUpdateProduct } from '../api/hooks'
import type { PaymentMethod } from '../api/client'
import { BottomLime, Note, PageTitle, Screen, ScreenError, ScreenSkeleton } from '../components/bonly'
import { MethodMulti } from '../components/PayMethods'
import { productBody } from '../lib/product'
import { haptic } from '../lib/telegram'

/** Чем можно платить за подписку. Выбраны все — храним пустой список, чтобы новые способы подключались сами. */
export default function ProductMethods() {
  const id = Number(useParams().productId)
  const navigate = useNavigate()
  const q = useProduct(id)
  const available = useOfferMethods()
  const update = useUpdateProduct(id)
  const [picked, setPicked] = useState<PaymentMethod[] | null>(null)

  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const p = q.data
  const saved = p.paymentMethods.length > 0 ? p.paymentMethods.filter((m) => available.includes(m)) : available
  const chosen = picked ?? saved
  const dirty = picked !== null && [...picked].sort().join() !== [...saved].sort().join()
  const save = () =>
    update.mutate(productBody(p, { paymentMethods: chosen.length === available.length ? [] : chosen }), {
      onSuccess: () => { haptic.success(); navigate(-1) },
      onError: () => haptic.error(),
    })

  return (
    <Screen bottom={<BottomLime disabled={!dirty} loading={update.isPending} onClick={save}>Сохранить</BottomLime>}>
      <PageTitle title="Способы оплаты" sub="Чем подписчик сможет заплатить." />
      <MethodMulti className="mt-[20px]" label="Способы оплаты" value={chosen} onChange={setPicked} options={available} />
      {update.error && <Note tone="danger">{update.error.message}</Note>}
    </Screen>
  )
}
