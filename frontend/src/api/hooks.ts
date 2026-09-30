import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { PaymentMethod, PayoutMethod, Schemas } from './client'

export const keys = {
  me: ['me'] as const,
  channels: ['channels'] as const,
  channel: (id: number) => ['channel', id] as const,
  offer: (id: number) => ['offer', id] as const,
  product: (id: number) => ['product', id] as const,
  productOffer: (id: number) => ['productOffer', id] as const,
  payment: (id: string) => ['payment', id] as const,
  subscriptions: ['subscriptions'] as const,
  stats: (days: number, channelId?: number) => ['stats', days, channelId ?? 'all'] as const,
  payouts: ['payouts'] as const,
  dayPayments: (date: string, channelId?: number) => ['dayPayments', date, channelId ?? 'all'] as const,
  recentPayments: (limit: number) => ['recentPayments', limit] as const,
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET('/me')) })

export const useChannels = () => useQuery({ queryKey: keys.channels, queryFn: () => unwrap(api.GET('/channels')) })

export const useConnectLink = () =>
  useQuery({ queryKey: ['connect'], queryFn: () => unwrap(api.GET('/channels/connect')), staleTime: Infinity })

export const useChannel = (id: number) =>
  useQuery({
    queryKey: keys.channel(id),
    queryFn: () => unwrap(api.GET('/channels/{channelId}', { params: { path: { channelId: id } } })),
    // Пока с ботом что-то не так, перепроверяем чаще: автор чинит права в Telegram и возвращается
    refetchInterval: (q) => (q.state.data && q.state.data.channel.botIssue !== 'none' ? 5000 : 30000),
    refetchOnWindowFocus: true,
  })

export function useDeleteChannel(channelId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE('/channels/{channelId}', { params: { path: { channelId } } })
      if (!response.ok) throw new Error((error as { message?: string } | undefined)?.message ?? 'Не получилось удалить канал')
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.channel(channelId) })
      qc.invalidateQueries({ queryKey: keys.channels })
    },
  })
}

export const usePayment = (id: string, poll: boolean) =>
  useQuery({
    queryKey: keys.payment(id),
    queryFn: () => unwrap(api.GET('/payments/{paymentId}', { params: { path: { paymentId: id } } })),
    refetchInterval: poll ? 2500 : false,
    refetchOnWindowFocus: true,
  })

export const useMySubscriptions = () =>
  useQuery({ queryKey: keys.subscriptions, queryFn: () => unwrap(api.GET('/subscriptions')) })

export const useStats = (days: number, channelId?: number) =>
  useQuery({
    queryKey: keys.stats(days, channelId),
    queryFn: () => unwrap(api.GET('/stats', { params: { query: { days, channelId } } })),
    placeholderData: (prev) => prev,
  })

/** Оплаты одного дня; запрос уходит только когда день развернули. */
export const useDayPayments = (date: string, enabled: boolean, channelId?: number) =>
  useQuery({
    queryKey: keys.dayPayments(date, channelId),
    queryFn: () => unwrap(api.GET('/stats/payments', { params: { query: { date, channelId } } })),
    enabled,
    staleTime: 60_000,
  })

/** Последние оплаты по всем каналам — лента на главной. */
export const useRecentPayments = (limit: number) =>
  useQuery({
    queryKey: keys.recentPayments(limit),
    queryFn: () => unwrap(api.GET('/stats/payments', { params: { query: { limit } } })),
  })

/** Последние оплаты одного канала. */
export const useDayPaymentsFeed = (channelId: number, limit: number) =>
  useQuery({
    queryKey: ['channelPayments', channelId, limit] as const,
    queryFn: () => unwrap(api.GET('/stats/payments', { params: { query: { channelId, limit } } })),
  })

export const usePayouts = () => useQuery({ queryKey: keys.payouts, queryFn: () => unwrap(api.GET('/payouts')) })

export const useProduct = (id: number) =>
  useQuery({
    queryKey: keys.product(id),
    queryFn: () => unwrap(api.GET('/products/{productId}', { params: { path: { productId: id } } })),
  })

/** Страница оплаты: по подписке, если она задана, иначе по каналу. */
export const useAnyOffer = (target: { productId?: number; channelId?: number }) =>
  useQuery({
    queryKey: target.productId ? keys.productOffer(target.productId) : keys.offer(target.channelId ?? 0),
    queryFn: () =>
      target.productId
        ? unwrap(api.GET('/products/{productId}/offer', { params: { path: { productId: target.productId } } }))
        : unwrap(api.GET('/offers/{channelId}', { params: { path: { channelId: target.channelId ?? 0 } } })),
  })

/** Способы оплаты, которые умеет платёжный провайдер. Пока их два, и сервер отдаёт их только в оффере. */
export const useOfferMethods = (): PaymentMethod[] => ['sbp', 'card']

export function useCreateProduct(channelId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['ProductCreate']) =>
      unwrap(api.POST('/channels/{channelId}/products', { params: { path: { channelId } }, body })),
    onSuccess: (p) => {
      qc.setQueryData(keys.product(p.id), p)
      qc.invalidateQueries({ queryKey: keys.channel(channelId) })
    },
  })
}

export function useUpdateProduct(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Schemas['ProductUpdate']) =>
      unwrap(api.PUT('/products/{productId}', { params: { path: { productId } }, body })),
    onSuccess: (p) => {
      qc.setQueryData(keys.product(p.id), p)
      qc.invalidateQueries({ queryKey: keys.channel(p.channelId) })
      qc.invalidateQueries({ queryKey: keys.productOffer(p.id) })
      qc.invalidateQueries({ queryKey: keys.offer(p.channelId) })
    },
  })
}

export function useDeleteProduct(productId: number, channelId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE('/products/{productId}', { params: { path: { productId } } })
      if (!response.ok) throw new Error((error as { message?: string } | undefined)?.message ?? 'Не получилось удалить подписку')
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.product(productId) })
      qc.invalidateQueries({ queryKey: keys.channel(channelId) })
      qc.invalidateQueries({ queryKey: keys.channels })
    },
  })
}

/** Готовит пост подписки на стороне бота; возвращает идентификатор для отправки. */
export function useShareProduct(productId: number) {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/products/{productId}/share', { params: { path: { productId } } })),
  })
}

/** Период подписки: создание и изменение. */
export function useSavePlan(productId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id?: number; body: Schemas['PlanUpdate'] }) =>
      v.id
        ? unwrap(api.PUT('/plans/{planId}', { params: { path: { planId: v.id } }, body: v.body }))
        : unwrap(api.POST('/products/{productId}/plans', { params: { path: { productId } }, body: { price: v.body.price, periodDays: v.body.periodDays } })),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: keys.product(productId) })
      qc.invalidateQueries({ queryKey: keys.channel(plan.channelId) })
      qc.invalidateQueries({ queryKey: keys.productOffer(productId) })
      qc.invalidateQueries({ queryKey: keys.offer(plan.channelId) })
    },
  })
}

export function useUpdateChannel(channelId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (description: string) =>
      unwrap(api.PATCH('/channels/{channelId}', { params: { path: { channelId } }, body: { description } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channel(channelId) })
      qc.invalidateQueries({ queryKey: keys.channels })
    },
  })
}

export function useCheckout() {
  return useMutation({
    mutationFn: (v: { planId: number; method: PaymentMethod }) => unwrap(api.POST('/checkout', { body: v })),
  })
}

export function useRequestPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { amount: number; method: PayoutMethod; destination: string }) =>
      unwrap(api.POST('/payouts', { body: v })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.me })
      qc.invalidateQueries({ queryKey: keys.payouts })
    },
  })
}
