import createClient from 'openapi-fetch'
import type { components, paths } from './schema'

export type Schemas = components['schemas']
export type Me = Schemas['Me']
export type Channel = Schemas['Channel']
export type Plan = Schemas['Plan']
export type Product = Schemas['Product']
export type Offer = Schemas['Offer']
export type Stats = Schemas['Stats']
export type Payout = Schemas['Payout']
export type PayoutMethod = Schemas['PayoutMethod']
export type PaymentMethod = Schemas['PaymentMethod']
export type MySubscription = Schemas['MySubscription']

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

let authorization: string | null = null
export function setAuthorization(value: string | null) {
  authorization = value
}

export const api = createClient<paths>({ baseUrl: '/api' })

api.use({
  onRequest({ request }) {
    if (authorization) request.headers.set('Authorization', authorization)
    return request
  },
})

/** Разворачивает ответ openapi-fetch: данные или ApiError с сообщением для пользователя. */
export async function unwrap<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await p
  if (error !== undefined || data === undefined) {
    const e = (error ?? {}) as { code?: string; message?: string }
    throw new ApiError(response.status, e.code ?? 'unknown', e.message ?? 'Что-то пошло не так')
  }
  return data
}

/** Загружает картинку сырым телом запроса и возвращает её id и адрес. */
export async function uploadImage(blob: Blob): Promise<{ id: string; url: string }> {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'application/octet-stream', ...(authorization ? { Authorization: authorization } : {}) },
    body: blob,
  })
  const body = (await res.json().catch(() => ({}))) as { id?: string; url?: string; code?: string; message?: string }
  if (!res.ok || !body.id || !body.url) throw new ApiError(res.status, body.code ?? 'unknown', body.message ?? 'Не получилось загрузить картинку')
  return { id: body.id, url: body.url }
}
