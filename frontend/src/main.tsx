import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiError, setAuthorization } from './api/client'
import App from './App'
import { guardTaps, initTelegram } from './lib/telegram'
import './styles.css'

const env = initTelegram()
guardTaps()
setAuthorization(env.authorization)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Ошибки 4xx (нет доступа, не найдено) не ретраим.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
})

const root = createRoot(document.getElementById('root')!)

if (!env.authorization) {
  root.render(
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <div className="text-[48px]">📱</div>
        <h1 className="mt-2 text-[20px] font-bold">Откройте Pitly в Telegram</h1>
        <p className="mt-1 text-muted">Приложение работает внутри Telegram: t.me/PitlyBot</p>
      </div>
    </div>,
  )
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App startParam={env.startParam} />
      </QueryClientProvider>
    </StrictMode>,
  )
}
