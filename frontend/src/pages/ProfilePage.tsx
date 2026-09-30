import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMe, useMySubscriptions } from '../api/hooks'
import { ListCard, ListRow, Note, PageTitle, Screen, ScreenError, ScreenSkeleton, SectionTitle } from '../components/bonly'
import { Icon } from '../components/Icon'
import { formatMoney } from '../lib/format'
import { haptic, shareLink } from '../lib/telegram'

const PARTNER_SHARE = 10 // процент от комиссии Pitly

/**
 * Партнёрам — экран приглашения, как «Invite friends» в Wise: короткий заголовок, одна строка пояснения,
 * ссылка и кнопка. Ниже только факты: что уже начислено и условия сервиса. Никаких нумерованных шагов и карточек-примеров.
 */
export default function ProfilePage() {
  const navigate = useNavigate()
  const me = useMe()
  const subs = useMySubscriptions()
  const [copied, setCopied] = useState(false)

  if (me.isPending) return <ScreenSkeleton back={false} />
  if (me.error) return <ScreenError error={me.error} onRetry={() => me.refetch()} back={false} />

  const { user, commissionBps, holdHours, minPayout } = me.data
  const refLink = `https://t.me/PitlyBot?startapp=r${user.id}`
  const share = () => shareLink(refLink, 'Продаю подписки на канал через Pitly. Комиссия 20%, деньги выводятся быстро. Попробуй')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(refLink)
      haptic.success()
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      share()
    }
  }
  const hasSubs = !!subs.data && subs.data.length > 0

  return (
    <Screen back={false}>
      <PageTitle
        title="Зовите авторов"
        sub={`За каждого получаете ${PARTNER_SHARE}% нашей комиссии.`}
      />

      <div className="mt-[20px] px-[16px]">
        <button type="button" onClick={copy} aria-label="Скопировать партнёрскую ссылку" className="tap r-card flex h-[60px] w-full items-center bg-surface pl-[16px] pr-[10px] text-left">
          <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
            <span className="text-[12px] leading-[15px] text-muted">{copied ? 'Ссылка скопирована' : 'Ваша ссылка'}</span>
            <span className="truncate text-[16px] font-medium leading-[21px] text-text">{refLink.replace('https://', '')}</span>
          </span>
          <span className="r-avatar grid h-[40px] w-[40px] shrink-0 place-items-center bg-glass text-text">
            <Icon name={copied ? 'check' : 'copy'} size={18} />
          </span>
        </button>
        <button type="button" onClick={() => { haptic.tap(); share() }} className="tap liquid liquid-lime mt-[8px] flex h-[48px] w-full items-center justify-center text-[16px] font-bold leading-[24px]">
          Пригласить автора
        </button>
      </div>

      <SectionTitle className="mt-[28px]">Кого вы привели</SectionTitle>
      <ListCard>
        <ListRow first title="Авторов" trailing={0} />
        <ListRow title="Заработано" trailing={formatMoney(0)} />
      </ListCard>
      <Note>Начислять начнём после запуска программы. Ссылкой уже можно делиться.</Note>

      <SectionTitle className="mt-[28px]">Условия Pitly</SectionTitle>
      <ListCard>
        <ListRow first title="Наша комиссия" subtitle="С каждой оплаты" trailing={`${commissionBps / 100}%`} />
        <ListRow title="Деньги можно вывести через" subtitle="После каждой оплаты" trailing={`${holdHours} ч`} />
        <ListRow title="Минимум на вывод" subtitle="СБП, карта или USDT" trailing={formatMoney(minPayout)} />
        {hasSubs && <ListRow title="Мои подписки" subtitle="Каналы, за которые вы платите" onClick={() => navigate('/subscriptions')} />}
      </ListCard>
      <SectionTitle className="mt-[28px]">Документы</SectionTitle>
      <ListCard>
        <ListRow first title="Публичная оферта" onClick={() => navigate('/legal/offer')} />
        <ListRow title="Политика конфиденциальности" onClick={() => navigate('/legal/privacy')} />
      </ListCard>
      <Note>Есть вопрос? Напишите @PitlyBot.</Note>
    </Screen>
  )
}
