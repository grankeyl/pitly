import { useLocation, useNavigate } from 'react-router'
import { haptic } from '../lib/telegram'
import { Icon, type IconName } from './Icon'
import { BottomFade, cx } from './bonly'

/**
 * Таб-бар: плавающая полоса 56 (композиция Revolut), элементы «иконка 22 + подпись 11», активный на своей пилюле.
 * Три раздела по 88, поля 4. Активный элемент белый, остальные приглушённые.
 */
export const TAB_PATHS = ['/', '/stats', '/profile']

const TABS: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'v2Home', label: 'Главная' },
  { path: '/stats', icon: 'v2Pie', label: 'Статистика' },
  { path: '/profile', icon: 'users', label: 'Партнёрам' },
]

const CELL = 88
const PAD = 4

export function TabBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  if (!TAB_PATHS.includes(pathname)) return null
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.path === pathname))

  return (
    <>
      <BottomFade />
      <div className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[393px] -translate-x-1/2 pb-[calc(var(--safe-bottom)+20px)]">
        <nav aria-label="Разделы" className="glass-bar pointer-events-auto relative mx-auto flex h-[56px] items-center" style={{ width: CELL * TABS.length + PAD * 2, padding: PAD }}>
          <span
            aria-hidden
            className="r-ctl pill-dark absolute top-[4px] h-[48px] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: CELL, left: PAD, transform: `translateX(${activeIndex * CELL}px)` }}
          />
          {TABS.map((t) => {
            const active = pathname === t.path
            return (
              <button
                key={t.path}
                aria-current={active ? 'page' : undefined}
                onClick={() => { if (!active) { haptic.select(); navigate(t.path) } }}
                className={cx('relative flex h-[48px] flex-col items-center justify-center gap-[2px] transition-colors duration-200', active ? 'text-accent' : 'text-muted')}
                style={{ width: CELL }}
              >
                <Icon name={t.icon} size={22} />
                <span className="whitespace-nowrap text-[11px] font-medium leading-[13px]">{t.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </>
  )
}
