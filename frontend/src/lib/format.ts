/** Суммы приходят в копейках. */
export function formatMoney(amount: number, currency = 'RUB'): string {
  const hasCents = amount % 100 !== 0
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount / 100)
}

export function formatPeriod(days: number): string {
  if (days === 0) return 'Навсегда'
  if (days % 365 === 0) return plural(days / 365, 'год', 'года', 'лет')
  if (days % 30 === 0) return plural(days / 30, 'месяц', 'месяца', 'месяцев')
  if (days % 7 === 0) return plural(days / 7, 'неделя', 'недели', 'недель')
  return plural(days, 'день', 'дня', 'дней')
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
  return `${n} ${word}`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** "1 234,5" -> 123450 копеек. null — если ввод некорректный. */
export function parseRubles(input: string): number | null {
  const s = input.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  return Math.round(parseFloat(s) * 100)
}
