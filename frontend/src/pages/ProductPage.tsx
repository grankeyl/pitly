import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useDeleteProduct, useProduct, useShareProduct } from '../api/hooks'
import { ActionCircles, BottomLime, DangerButton, Note, PageTitle, Sheet, Screen, ScreenError, ScreenSkeleton, SectionTitle, avatarImage } from '../components/bonly'
import { TelegramPost } from '../components/TelegramPost'
import { plural } from '../lib/format'
import { postText } from '../lib/product'
import { haptic, shareLink, sharePrepared } from '../lib/telegram'

/**
 * Подписка: крупное название → карточка с описанием, каналом и числом периодов → действия → как пост выглядит в Telegram.
 * Главное действие внизу — отправить этот пост в любой чат.
 */
export default function ProductPage() {
  const id = Number(useParams().productId)
  const navigate = useNavigate()
  const q = useProduct(id)
  const [copied, setCopied] = useState(false)
  const [more, setMore] = useState(false)
  const prepared = useShareProduct(id)
  const [settings, setSettings] = useState(false)
  const remove = useDeleteProduct(id, q.data?.channelId ?? 0)

  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />

  const p = q.data
  const live = p.plans.filter((x) => x.isActive)
  const shareAsLink = () => shareLink(p.url, p.title)
  // Сначала пробуем отправить готовый пост с картинкой и кнопкой; простая ссылка — запасной путь
  const share = () =>
    prepared.mutate(undefined, {
      onSuccess: async (r) => { if (!(await sharePrepared(r.preparedMessageId))) shareAsLink() },
      onError: () => shareAsLink(),
    })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.url)
      haptic.success()
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      shareAsLink()
    }
  }

  return (
    <Screen bottom={<BottomLime disabled={!p.isActive || live.length === 0} loading={prepared.isPending} onClick={share}>Отправить пост</BottomLime>}>
      <PageTitle title={p.title} />

      <div className="r-card mx-[16px] mt-[16px] bg-surface p-[16px]">
        {p.description ? (
          <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="block w-full cursor-pointer text-left">
            <p className={`whitespace-pre-wrap break-words text-[16px] leading-[22px] text-text ${more ? '' : 'line-clamp-3'}`}>{p.description}</p>
          </button>
        ) : (
          <p className="text-[16px] leading-[22px] text-muted">Описания пока нет</p>
        )}
        <div className="mt-[14px] flex flex-wrap items-center gap-[8px]">
          <button type="button" onClick={() => { haptic.tap(); navigate(`/channels/${p.channelId}`) }} className="tap pill-dark flex h-[34px] min-w-0 items-center gap-[8px] pl-[4px] pr-[12px]">
            <img src={avatarImage(p.channelTitle)} alt="" draggable={false} className="h-[26px] w-[26px] rounded-full object-cover" />
            <span className="truncate text-[14px] font-semibold leading-[18px] text-text">{p.channelTitle}</span>
          </button>
          <span className="pill-dark flex h-[34px] items-center px-[12px] text-[14px] font-semibold leading-[18px] text-text-2">
            {p.isActive ? (live.length > 0 ? plural(live.length, 'период', 'периода', 'периодов') : 'Нет периодов') : 'Снята с продажи'}
          </span>
        </div>
      </div>

      <ActionCircles
        className="pt-[20px]"
        actions={[
          { icon: 'note', label: 'Изменить', onClick: () => navigate(`/products/${id}/edit`) },
          { icon: copied ? 'check' : 'copy', label: copied ? 'Скопировано' : 'Ссылка', onClick: copy },
          { icon: 'settings', label: 'Настройки', onClick: () => setSettings(true) },
        ]}
      />

      <SectionTitle className="mt-[28px]">Пост в Telegram</SectionTitle>
      <div className="mt-[10px]">
        <TelegramPost text={postText(p.title, p.description, p.plans)} button={p.buttonText} image={p.imageUrl ?? null} />
      </div>
      <Note>Пост с кнопкой можно отправить в канал, группу или личный чат.</Note>
      <Sheet
        open={settings}
        onClose={() => setSettings(false)}
        title={p.title}
        text="Если удалить подписку, её больше нельзя будет купить. Кто уже оплатил, сохранит доступ до конца срока."
      >
        <DangerButton
          loading={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: () => { haptic.success(); navigate(`/channels/${p.channelId}`, { replace: true }) }, onError: () => haptic.error() })}
        >
          Удалить подписку
        </DangerButton>
        {remove.error && <p role="alert" className="px-[4px] text-[13px] leading-[17px] text-danger">{remove.error.message}</p>}
      </Sheet>
    </Screen>
  )
}
