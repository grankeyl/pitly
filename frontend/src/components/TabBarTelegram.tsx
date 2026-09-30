import { useLocation, useNavigate } from 'react-router'
import { haptic } from '../lib/telegram'
import { Icon, type IconName } from './Icon'
import { cx } from './bonly'

/**
 * Tab Bar (iOS) из Telegram Mini Apps · UI Kit (Figma zs8wC4XKQDTPBa7tXf3FrU, node 45:1275, вариант tabCount=3):
 *   полоса 393 на всю ширину, backdrop-blur 22, фон surface_primary (.95), верхняя линия divider,
 *   элемент: flex-1, колонка gap 4, pt 8 / pb 4, иконка 28, подпись Semibold 10 / lh 13 / tracking .06;
 *   активный — link_color, неактивный — secondary_hint; снизу зона home indicator (34) = safe-area.
 * Перекраска в токены Pitly: фон #1E1E1E .95, divider rgba(255,255,255,.13), активный lime, неактивный #A1A1A3, шрифт Inter.
 */
const TAB_PATHS = ['/', '/stats', '/profile']

const TABS: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'v2Home', label: 'Главная' },
  { path: '/stats', icon: 'v2Pie', label: 'Статистика' },
  { path: '/profile', icon: 'v2Category', label: 'Ещё' },
]

export function TabBarTelegram() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  if (!TAB_PATHS.includes(pathname)) return null

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[393px] -translate-x-1/2 border-t border-solid border-[rgba(255,255,255,0.13)] bg-[rgba(30,30,30,0.95)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-[22px]"
      data-figma="zs8wC4XKQDTPBa7tXf3FrU:45:1281"
    >
      <div className="flex w-full items-center justify-between">
        {TABS.map((t) => {
          const active = pathname === t.path
          return (
            <button
              key={t.path}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              onClick={() => { if (!active) { haptic.select(); navigate(t.path) } }}
              className={cx('flex min-w-px flex-1 flex-col items-center justify-center gap-[4px] pb-[4px] pt-[8px] transition-colors duration-150', active ? 'text-lime' : 'text-muted')}
            >
              <Icon name={t.icon} size={28} />
              <span className="whitespace-nowrap text-[10px] font-semibold leading-[13px] tracking-[0.06px]">{t.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
