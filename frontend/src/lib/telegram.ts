// Интеграция с Telegram Mini App. Вне Telegram (обычный браузер) приложение
// работает в dev-режиме: авторизация `dev <id>`, параметры берутся из URL.
import {
  backButton,
  hapticFeedback,
  init,
  isTMA,
  miniApp,
  openLink,
  openTelegramLink,
  popup,
  retrieveLaunchParams,
  retrieveRawInitData,
  shareMessage,
  swipeBehavior,
  themeParams,
  viewport,
} from '@telegram-apps/sdk-react'

export type TelegramEnv = {
  inTelegram: boolean
  /** Значение для заголовка Authorization. */
  authorization: string | null
  startParam: string | null
  isDark: boolean
}

function safe(fn: () => void) {
  try {
    fn()
  } catch (e) {
    console.warn('[telegram]', e)
  }
}

const THEMES: string[] = []

/** Тема: берётся из ?theme=… и запоминается; по умолчанию mono. */
function applyTheme() {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get('theme')
    const theme = fromUrl && THEMES.includes(fromUrl) ? fromUrl : localStorage.getItem('pitly_theme_v5')
    if (fromUrl && THEMES.includes(fromUrl)) localStorage.setItem('pitly_theme_v5', fromUrl)
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  } catch {
    /* хранилище недоступно — остаётся тема по умолчанию */
  }
}

export function initTelegram(): TelegramEnv {
  applyTheme()
  if (!isTMA()) {
    const url = new URL(window.location.href)
    const devUser = url.searchParams.get('dev_user') ?? localStorage.getItem('pitly_dev_user') ?? '1'
    localStorage.setItem('pitly_dev_user', devUser)
    return {
      inTelegram: false,
      authorization: import.meta.env.DEV ? `dev ${devUser}` : null,
      startParam: url.searchParams.get('startapp'),
      isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    }
  }

  init()
  safe(() => miniApp.mountSync.ifAvailable())
  safe(() => themeParams.mountSync.ifAvailable())
  safe(() => backButton.mount.ifAvailable())
  safe(() => swipeBehavior.mount.ifAvailable())
  safe(() => swipeBehavior.disableVertical.ifAvailable())
  safe(() => {
    const mounted = viewport.mount.ifAvailable()
    if (mounted[0])
      mounted[1]
        .then(() => {
          viewport.expand.ifAvailable()
          // На телефоне открываемся на весь экран; на компьютере окно Telegram остаётся обычным
          const platform = retrieveLaunchParams(true).tgWebAppPlatform
          if (platform === 'ios' || platform === 'android') {
            const p = viewport.requestFullscreen.ifAvailable()
            if (p[0]) p[1].catch(() => {})
          }
          // CSS-переменные --tg-viewport-* (в т.ч. content-safe-area-inset-top для fullscreen)
          viewport.bindCssVars.ifAvailable()
        })
        .catch(() => {})
  })

  const lp = retrieveLaunchParams(true)
  const raw = retrieveRawInitData()
  const isDark = (() => {
    try {
      return themeParams.isDark()
    } catch {
      return true
    }
  })()

  // Шапка и фон Telegram в цвет приложения (интерфейс всегда тёмный).
  const bg = (getComputedStyle(document.documentElement).getPropertyValue('--t-bg').trim() || '#0f0f0f') as `#${string}`
  safe(() => miniApp.setHeaderColor.ifAvailable(bg))
  safe(() => miniApp.setBackgroundColor.ifAvailable(bg))
  safe(() => miniApp.setBottomBarColor.ifAvailable(bg))
  safe(() => miniApp.ready.ifAvailable())

  return {
    inTelegram: true,
    authorization: raw ? `tma ${raw}` : null,
    // Кнопка в чате с ботом открывает приложение по прямому адресу: параметр запуска приходит в самом адресе
    startParam: lp.tgWebAppStartParam ?? new URL(window.location.href).searchParams.get('startapp'),
    isDark,
  }
}

export function openExternal(url: string) {
  if (isTMA() && openLink.isAvailable()) openLink(url)
  else window.open(url, '_blank', 'noopener')
}

export function openTelegram(url: string) {
  if (isTMA() && openTelegramLink.isAvailable()) openTelegramLink(url)
  else window.open(url, '_blank', 'noopener')
}

export function shareLink(url: string, text: string) {
  openTelegram(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
}

/**
 * Отправить подготовленный ботом пост: Telegram сам покажет выбор чата.
 * false — окно не открылось (старый Telegram или обычный браузер), тогда вызывающий делится простой ссылкой.
 */
export async function sharePrepared(id: string): Promise<boolean> {
  try {
    if (!isTMA() || !shareMessage.isAvailable()) return false
    await shareMessage(id)
    return true
  } catch (e) {
    console.warn('[telegram] shareMessage', e)
    // Пользователь закрыл окно выбора чата — это не ошибка, ссылку следом не подсовываем
    return true
  }
}

/** Подтверждение опасного действия: родное окно Telegram, в браузере — обычное окно подтверждения. */
export async function confirmDanger(title: string, message: string, okText: string): Promise<boolean> {
  try {
    if (isTMA() && popup.show.isAvailable()) {
      const id = await popup.show({
        title,
        message,
        buttons: [
          { id: 'ok', type: 'destructive', text: okText },
          { id: 'cancel', type: 'cancel' },
        ],
      })
      return id === 'ok'
    }
  } catch (e) {
    console.warn('[telegram] popup', e)
  }
  return window.confirm(`${title}\n\n${message}`)
}

export const haptic = {
  tap: () => safe(() => hapticFeedback.impactOccurred.ifAvailable('light')),
  success: () => safe(() => hapticFeedback.notificationOccurred.ifAvailable('success')),
  error: () => safe(() => hapticFeedback.notificationOccurred.ifAvailable('error')),
  select: () => safe(() => hapticFeedback.selectionChanged.ifAvailable()),
}

export const tgBackButton = {
  show: () => safe(() => backButton.show.ifAvailable()),
  hide: () => safe(() => backButton.hide.ifAvailable()),
  onClick: (fn: () => void): (() => void) => {
    try {
      return backButton.onClick.ifAvailable(fn)?.[1] ?? (() => {})
    } catch {
      return () => {}
    }
  },
}

/**
 * Отмена нажатия, если палец уехал. Браузер считает касание нажатием, пока не началась прокрутка,
 * поэтому «нажал, передумал, медленно отвёл палец» всё равно открывало экран.
 * Запоминаем точку касания и гасим click, если палец сместился дальше порога или ушёл с элемента.
 */
export function guardTaps(threshold = 10) {
  let start: { x: number; y: number; target: EventTarget | null } | null = null
  let moved = false
  document.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY, target: e.target }; moved = false }, { capture: true, passive: true })
  document.addEventListener('pointermove', (e) => {
    if (start && !moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > threshold) {
      moved = true
      document.documentElement.classList.add('tap-cancelled')
    }
  }, { capture: true, passive: true })
  const release = () => setTimeout(() => document.documentElement.classList.remove('tap-cancelled'), 0)
  document.addEventListener('pointerup', release, { capture: true, passive: true })
  document.addEventListener('pointercancel', () => { moved = true; release() }, { capture: true, passive: true })
  document.addEventListener('click', (e) => {
    // Нажатия с клавиатуры и из кода приходят без координат — их не трогаем
    if (moved && e.detail > 0) {
      e.preventDefault()
      e.stopPropagation()
    }
    moved = false
    start = null
  }, { capture: true })
}
