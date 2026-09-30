import { useParams } from 'react-router'
import { useMe } from '../api/hooks'
import { PageTitle, Screen } from '../components/bonly'
import { formatMoney } from '../lib/format'
import { offer, privacy } from '../lib/legal'

/** Документ для чтения: заголовок, дата редакции, вступление и разделы с пунктами. Ширина строки удобна для чтения с телефона. */
export default function LegalPage() {
  const kind = useParams().doc
  const me = useMe()
  const doc = kind === 'privacy'
    ? privacy()
    : offer({
        commission: `${(me.data?.commissionBps ?? 2000) / 100}%`,
        holdHours: me.data?.holdHours ?? 24,
        minPayout: formatMoney(me.data?.minPayout ?? 50000),
      })

  return (
    <Screen>
      <PageTitle title={doc.title} sub={doc.updated} />
      <p className="mt-[16px] px-[20px] text-pretty text-[15px] leading-[22px] text-text-2">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.title} className="mt-[24px] px-[20px]">
          <h2 className="font-display text-[17px] leading-[23px] text-text">{s.title}</h2>
          <ul className="mt-[8px] flex flex-col gap-[8px]">
            {s.items.map((t) => (
              <li key={t} className="select-text text-pretty text-[15px] leading-[22px] text-text-2">{t}</li>
            ))}
          </ul>
        </section>
      ))}
    </Screen>
  )
}
