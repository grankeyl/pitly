import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { keys, useChannels, useConnectLink } from '../api/hooks'
import { Bone, BottomLime, Circle47, ListCard, ListRow, Note, PageTitle, Screen, SelectMark } from '../components/bonly'
import { clearPending, findConnected, readPending, startPending } from '../lib/connect'
import { haptic, openTelegram } from '../lib/telegram'

/**
 * Подключение канала. Три состояния: инструкция → ждём, пока автор добавит бота в Telegram → канал найден.
 * Пока ждём, список каналов опрашивается каждые три секунды; найденный канал открывается сам.
 */
export default function ConnectChannel() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const link = useConnectLink()
  const channels = useChannels()
  const [waiting, setWaiting] = useState(() => readPending() !== null)
  const [found, setFound] = useState<string | null>(null)

  // Пока ждём, список каналов опрашивается каждые три секунды
  useEffect(() => {
    if (!waiting || found) return
    const t = setInterval(() => qc.invalidateQueries({ queryKey: keys.channels }), 3000)
    return () => clearInterval(t)
  }, [qc, waiting, found])

  useEffect(() => {
    const pending = readPending()
    if (!channels.data || !pending || found) return
    const added = findConnected(channels.data, pending)
    if (!added) return
    clearPending()
    haptic.success()
    setFound(added.title)
    const t = setTimeout(() => navigate(`/channels/${added.id}`, { replace: true }), 1100)
    return () => clearTimeout(t)
  }, [channels.data, navigate, found])

  const bot = link.data ? `@${link.data.botUsername}` : '@PitlyBot'
  const open = () => {
    if (!link.data || !channels.data) return
    startPending(channels.data)
    setWaiting(true)
    openTelegram(link.data.url)
  }

  return (
    <Screen bottom={found ? undefined : <BottomLime disabled={!link.data || !channels.data} loading={link.isPending} onClick={open}>{waiting ? 'Открыть выбор ещё раз' : 'Выбрать канал'}</BottomLime>}>
      <PageTitle title="Подключить канал" sub="Бот сам пускает тех, кто оплатил, и убирает тех, у кого подписка кончилась." />

      {link.isPending ? (
        <div className="mt-[20px] flex flex-col gap-[1px] px-[16px]">
          <Bone className="r-card h-[180px]" />
        </div>
      ) : (
        <ListCard className="mt-[20px]">
          <ListRow first avatar={<Circle47 letter="1" />} title="Выберите канал или группу" subtitle="Где вы админ" />
          <ListRow avatar={<Circle47 letter="2" />} title={`Сделайте ${bot} админом`} subtitle="Нужны права приглашать и банить" />
          <ListRow avatar={<Circle47 letter="3" />} title="Вернитесь сюда" subtitle="Канал появится сам" />
        </ListCard>
      )}

      {found ? (
        <div role="status" className="pop-in r-card mx-[16px] mt-[8px] flex min-h-[60px] items-center gap-[12px] bg-surface px-[16px] py-[10px]">
          <SelectMark on />
          <div className="flex min-w-0 flex-col gap-[1px]">
            <span className="truncate text-[16px] font-semibold leading-[21px] text-text">Канал подключён</span>
            <span className="truncate text-[14px] leading-[18px] text-muted">{found}</span>
          </div>
        </div>
      ) : waiting ? (
        <div role="status" className="r-card mx-[16px] mt-[8px] flex min-h-[60px] items-center gap-[12px] bg-surface px-[16px] py-[10px]">
          <span aria-hidden className="dots flex w-[22px] shrink-0 items-center justify-center gap-[3px] text-accent"><i /><i /><i /></span>
          <div className="flex min-w-0 flex-col gap-[1px]">
            <span className="text-[16px] font-semibold leading-[21px] text-text">Ждём канал</span>
            <span className="text-[14px] leading-[18px] text-muted">Добавьте бота и вернитесь, проверяем сами</span>
          </div>
        </div>
      ) : (
        <Note>Канал должен быть закрытым. В открытый и так зайдёт кто угодно.</Note>
      )}
      {link.error && <Note tone="danger">{link.error.message}</Note>}
    </Screen>
  )
}
