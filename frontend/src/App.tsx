import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, useLocation, useNavigate } from 'react-router'
import { keys, useChannels } from './api/hooks'
import { clearPending, findConnected, readPending } from './lib/connect'
import { haptic } from './lib/telegram'
import { RouterProvider } from 'react-router/dom'
import { TabBar } from './components/TabBar'
import ChannelPage from './pages/ChannelPage'
import ConnectChannel from './pages/ConnectChannel'
import Home from './pages/Home'
import LegalPage from './pages/LegalPage'
import MySubscriptions from './pages/MySubscriptions'
import OfferPage from './pages/OfferPage'
import PaymentStatus from './pages/PaymentStatus'
import PayoutPage from './pages/PayoutPage'
import PeriodForm from './pages/PeriodForm'
import ProductDetails from './pages/ProductDetails'
import ProductEdit from './pages/ProductEdit'
import ProductMethods from './pages/ProductMethods'
import ProductPage from './pages/ProductPage'
import ProfilePage from './pages/ProfilePage'
import StatsPage from './pages/StatsPage'

/**
 * Параметр запуска (t.me/PitlyBot?startapp=...) -> стартовый экран:
 *   c<id>   — страница оплаты канала
 *   s<id>   — страница оплаты конкретной подписки
 *   p<uuid> — статус платежа (возврат со страницы оплаты)
 *   m<id>   — управление каналом (из уведомления бота)
 */
export function initialPath(startParam: string | null): string {
  if (!startParam) return '/'
  const kind = startParam[0]
  const rest = startParam.slice(1)
  if (kind === 'c' && /^\d+$/.test(rest)) return `/offer/${rest}`
  if (kind === 's' && /^\d+$/.test(rest)) return `/product-offer/${rest}`
  if (kind === 'm' && /^\d+$/.test(rest)) return `/channels/${rest}`
  if (kind === 'p' && /^[0-9a-f-]{36}$/i.test(rest)) return `/payment/${rest}`
  return '/'
}

/**
 * Если приложение перезапустилось, пока автор добавлял бота в канал, ожидание продолжается здесь:
 * как только канал появился, открываем его страницу.
 */
function PendingConnect() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const qc = useQueryClient()
  const channels = useChannels()
  const [pending, setPending] = useState(() => readPending() !== null)

  useEffect(() => {
    if (!pending) return
    const t = setInterval(() => {
      if (readPending() === null) setPending(false)
      else qc.invalidateQueries({ queryKey: keys.channels })
    }, 3000)
    return () => clearInterval(t)
  }, [pending, qc])

  useEffect(() => {
    // На экране подключения переход делает сам экран, со своим сообщением об успехе
    if (pathname === '/channels/connect') return
    const p = readPending()
    if (!p || !channels.data) return
    const added = findConnected(channels.data, p)
    if (!added) return
    clearPending()
    setPending(false)
    haptic.success()
    navigate(`/channels/${added.id}`)
  }, [channels.data, pathname, navigate])

  return null
}

function Layout() {
  return (
    <>
      <PendingConnect />
      <Outlet />
      <TabBar />
    </>
  )
}

const routes = [
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/stats', element: <StatsPage /> },
      { path: '/subscriptions', element: <MySubscriptions /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/channels/connect', element: <ConnectChannel /> },
      { path: '/channels/:id', element: <ChannelPage /> },
      { path: '/channels/:id/stats', element: <StatsPage /> },
      { path: '/channels/:id/products/new', element: <ProductDetails /> },
      { path: '/products/:productId', element: <ProductPage /> },
      { path: '/products/:productId/edit', element: <ProductEdit /> },
      { path: '/products/:productId/details', element: <ProductDetails /> },
      { path: '/products/:productId/methods', element: <ProductMethods /> },
      { path: '/products/:productId/plans/:planId', element: <PeriodForm /> },
      { path: '/offer/:channelId', element: <OfferPage /> },
      { path: '/product-offer/:productId', element: <OfferPage /> },
      { path: '/payment/:paymentId', element: <PaymentStatus /> },
      { path: '/payout', element: <PayoutPage /> },
      { path: '/legal/:doc', element: <LegalPage /> },
      { path: '*', element: <Home /> },
    ],
  },
]

// Memory router: у mini app нет адресной строки, а hash занят параметрами Telegram.
export default function App({ startParam }: { startParam: string | null }) {
  const [router] = useState(() => createMemoryRouter(routes, { initialEntries: [initialPath(startParam)] }))
  return <RouterProvider router={router} />
}
