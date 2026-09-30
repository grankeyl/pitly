import type { ReactNode } from 'react'

/*
 * Предпросмотр поста канала в Telegram (тёмная тема iOS): пост в блоке с обоями чата.
 * Пузырь сообщения с хвостиком слева, необязательная картинка сверху, «просмотры + время» в правом нижнем углу текста,
 * под пузырём — инлайн-кнопка во всю его ширину со значком внешней ссылки в углу.
 * Цвета здесь собственные цвета Telegram, а не токены Pitly: блок изображает чужой интерфейс.
 */
const TG = {
  bubble: '#262628',
  text: '#ffffff',
  meta: 'rgba(255,255,255,0.45)',
  button: '#38383b',
}

export function TelegramPost({ text, button = 'Подписаться', time, image }: { text: ReactNode; button?: string; time?: string; image?: string | null }) {
  const now = time ?? new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return (
    <figure aria-label="Предпросмотр поста в Telegram" className="tg-wallpaper r-card mx-[16px] overflow-hidden px-[10px] py-[14px]">
      <div className="max-w-[88%]">
        <div className="relative overflow-hidden" style={{ background: TG.bubble, borderRadius: '17px 17px 17px 5px' }}>
          {/* Фото показывается целиком, как в Telegram: пропорции сохраняются, очень высокие картинки ограничены по высоте */}
          {image && <img src={image} alt="" draggable={false} className="block h-auto w-full" />}
          <div className="relative px-[12px] py-[8px]">
          <div className="whitespace-pre-wrap break-words text-[16px] leading-[21px]" style={{ color: TG.text }}>
            {text}
            {/* Невидимая распорка: оставляет место под метку времени в последней строке */}
            <span aria-hidden className="inline-block h-[1px] w-[74px]" />
          </div>
          <div className="pointer-events-none absolute bottom-[6px] right-[10px] flex items-center gap-[3px] text-[11px] leading-[13px]" style={{ color: TG.meta }}>
            <svg width="15" height="10" viewBox="0 0 15 10" fill="none" aria-hidden>
              <path d="M7.5 1C4.4 1 2 3.3 1 5c1 1.7 3.4 4 6.5 4S13 6.7 14 5c-1-1.7-3.4-4-6.5-4Z" stroke="currentColor" strokeWidth="1.1" />
              <circle cx="7.5" cy="5" r="1.7" fill="currentColor" />
            </svg>
            <span>1</span>
            <span className="ml-[2px]">{now}</span>
          </div>
          </div>
        </div>

        <div
          className="relative mt-[4px] flex h-[38px] items-center justify-center px-[28px] text-[15px] font-medium leading-[19px]"
          style={{ background: TG.button, color: TG.text, borderRadius: '6px 6px 14px 14px' }}
        >
          <span className="truncate">{button}</span>
          <svg className="absolute right-[6px] top-[6px]" width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
            <path d="M1.5 6.5 6.5 1.5M2.6 1.5h3.9v3.9" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </figure>
  )
}
