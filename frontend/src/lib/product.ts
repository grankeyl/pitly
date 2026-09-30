import type { Plan, Product, Schemas } from '../api/client'
import { formatMoney, formatPeriod } from './format'

export const DEFAULT_BUTTON = 'Подписаться'
export const BUTTON_LIMIT = 32
export const PERIODS = [7, 30, 90, 180, 365, 0]
export const PRICE_MIN = 10000
export const PRICE_MAX = 30000000

/** Тело запроса на изменение подписки: сервер ждёт все поля целиком, меняем только нужные. */
export function productBody(p: Product, patch: Partial<Schemas['ProductUpdate']> = {}): Schemas['ProductUpdate'] {
  return {
    title: p.title,
    description: p.description,
    buttonText: p.buttonText,
    imageId: p.imageId,
    paymentMethods: p.paymentMethods,
    isActive: p.isActive,
    ...patch,
  }
}

/** Текст поста так, как его увидят в канале. */
export function postText(title: string, description: string, plans: Pick<Plan, 'price' | 'periodDays' | 'isActive' | 'currency'>[]): string {
  const prices = plans.filter((p) => p.isActive).map((p) => `${formatPeriod(p.periodDays)} — ${formatMoney(p.price, p.currency)}`)
  return [title.trim() || 'Название', description.trim(), prices.join('\n')].filter(Boolean).join('\n\n')
}
