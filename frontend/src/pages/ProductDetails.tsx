import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useChannel, useCreateProduct, useProduct, useUpdateProduct } from '../api/hooks'
import { uploadImage } from '../api/client'
import type { Product } from '../api/client'
import { BottomLime, Note, Screen, ScreenError, ScreenSkeleton, cx } from '../components/bonly'
import { TelegramPost } from '../components/TelegramPost'
import { BUTTON_LIMIT, DEFAULT_BUTTON, postText, productBody } from '../lib/product'
import { haptic } from '../lib/telegram'

// У новой подписки всё заполнено заранее: её можно создать, ничего не трогая
const NEW_TITLE = 'Подписка на канал'
const NEW_DESCRIPTION = 'Сюда пишу то, что не выкладываю в открытый канал.'
// Как в Tribute: подписка создаётся с двумя периодами, месяц и год. Год стоит как двенадцать месяцев
const NEW_PLANS = [
  { price: 49000, periodDays: 30 },
  { price: 588000, periodDays: 365 },
]

/** Детали подписки. Два входа: новая подписка в канале и правка существующей. */
export default function ProductDetails() {
  const params = useParams()
  const productId = params.productId ? Number(params.productId) : undefined
  return productId ? <Existing id={productId} /> : <Fresh channelId={Number(params.id)} />
}

function Existing({ id }: { id: number }) {
  const q = useProduct(id)
  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />
  return <Form product={q.data} channelId={q.data.channelId} />
}

function Fresh({ channelId }: { channelId: number }) {
  const q = useChannel(channelId)
  if (q.isPending) return <ScreenSkeleton hero={false} />
  if (q.error) return <ScreenError error={q.error} onRetry={() => q.refetch()} />
  return <Form channelId={channelId} />
}

/** Уменьшает картинку до 1280 по длинной стороне и сжимает в JPEG: посту хватает, а загрузка быстрая. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Не получилось обработать картинку')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Не получилось обработать картинку')
  return blob
}

/** Подпись секции формы: мелкие прописные над блоком, как в настройках Telegram. */
function FormLabel({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  const cls = cx('mb-[8px] block px-[20px] text-[13px] font-medium uppercase leading-[16px] tracking-[0.02em] text-muted', className ?? 'mt-[24px]')
  return htmlFor ? <label htmlFor={htmlFor} className={cls}>{children}</label> : <h2 className={cls}>{children}</h2>
}

/** Название и описание одной карточкой, кнопка, картинка, ниже — как пост выглядит на обоях Telegram. */
function Form({ product, channelId }: { product?: Product; channelId: number }) {
  const navigate = useNavigate()
  const create = useCreateProduct(channelId)
  const update = useUpdateProduct(product?.id ?? 0)
  const saving = create.isPending || update.isPending
  const error = create.error ?? update.error

  const [title, setTitle] = useState(product ? product.title : NEW_TITLE)
  const [description, setDescription] = useState(product ? product.description : NEW_DESCRIPTION)
  const [buttonText, setButtonText] = useState(product?.buttonText ?? DEFAULT_BUTTON)
  const [image, setImage] = useState<{ id: string; url: string } | null>(product?.imageId && product.imageUrl ? { id: product.imageId, url: product.imageUrl } : null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview) }, [localPreview])

  const buttonError = buttonText.length > BUTTON_LIMIT ? `Не длиннее ${BUTTON_LIMIT} символов` : null
  const valid = title.trim().length > 0 && !buttonError && !uploading
  const previewImage = localPreview ?? image?.url ?? null

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setImageError(null)
    if (!file.type.startsWith('image/')) {
      setImageError('Это не картинка. Подойдёт JPEG, PNG или WebP')
      return
    }
    setUploading(true)
    try {
      const blob = await compressImage(file)
      setLocalPreview(URL.createObjectURL(blob))
      setImage(await uploadImage(blob))
      haptic.success()
    } catch (e) {
      setLocalPreview(null)
      setImageError(e instanceof Error ? e.message : 'Не получилось загрузить картинку')
      haptic.error()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const removeImage = () => { setImage(null); setLocalPreview(null); setImageError(null) }

  const submit = () => {
    if (!valid) return
    const fields = { title: title.trim(), description: description.trim(), buttonText: buttonText.trim() || DEFAULT_BUTTON, imageId: image?.id }
    if (product) {
      update.mutate(productBody(product, fields), { onSuccess: () => { haptic.success(); navigate(-1) }, onError: () => haptic.error() })
    } else {
      create.mutate(
        { ...fields, plans: NEW_PLANS },
        // Новая подписка сразу открывает настройки: там цена, срок и способы оплаты
        { onSuccess: (p) => { haptic.success(); navigate(`/products/${p.id}/edit`, { replace: true, state: { fresh: true } }) }, onError: () => haptic.error() },
      )
    }
  }

  const plans = product?.plans ?? NEW_PLANS.map((p) => ({ ...p, isActive: true, currency: 'RUB' }))

  return (
    <Screen bottom={<BottomLime disabled={!valid} loading={saving} onClick={submit}>{product ? 'Сохранить' : 'Создать подписку'}</BottomLime>}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pickImage(e.target.files?.[0])} />

          <FormLabel htmlFor="plan-title" className="mt-[12px]">Название и описание</FormLabel>
          <div className="r-card mx-[16px] overflow-hidden bg-surface transition-colors duration-200 focus-within:bg-surface-2">
            <input
              id="plan-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 64))}
              placeholder="Название"
              autoComplete="off"
              className="h-[52px] w-full bg-transparent px-[16px] text-[16px] font-medium leading-[21px] text-text outline-none placeholder:font-normal placeholder:text-dim"
            />
            <div className="ml-[16px] h-px bg-separator" />
            <textarea
              aria-label="Описание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Пара слов о канале"
              rows={4}
              className="block w-full resize-none bg-transparent px-[16px] py-[14px] text-[16px] leading-[21px] text-text outline-none placeholder:text-dim"
            />
          </div>

          <FormLabel htmlFor="plan-button">Кнопка</FormLabel>
          <div className={cx('r-card mx-[16px] flex h-[52px] items-center bg-surface pr-[16px] transition-colors duration-200 focus-within:bg-surface-2')}>
            <input
              id="plan-button"
              value={buttonText}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder={DEFAULT_BUTTON}
              autoComplete="off"
              aria-invalid={!!buttonError}
              className="h-full min-w-0 flex-1 bg-transparent px-[16px] text-[16px] font-medium leading-[21px] text-text outline-none placeholder:font-normal placeholder:text-dim"
            />
            <span className={cx('tnum shrink-0 text-[14px] leading-[18px]', buttonError ? 'text-danger' : 'text-dim')}>{BUTTON_LIMIT - buttonText.length}</span>
          </div>
          {buttonError && <Note tone="danger">{buttonError}</Note>}

          <FormLabel>Картинка</FormLabel>
          {previewImage ? (
            <div className="r-card mx-[16px] flex items-center gap-[12px] bg-surface p-[8px]">
              <img src={previewImage} alt="" draggable={false} className="h-[64px] w-[96px] shrink-0 rounded-[16px] object-cover" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-[8px]">
                <button type="button" disabled={uploading} onClick={() => { haptic.tap(); fileRef.current?.click() }} className="tap pill-dark h-[36px] px-[14px] text-[14px] font-semibold text-text disabled:opacity-60">{uploading ? 'Загружаем' : 'Заменить'}</button>
                <button type="button" disabled={uploading} onClick={() => { haptic.tap(); removeImage() }} className="tap h-[36px] rounded-full px-[12px] text-[14px] font-semibold text-danger disabled:opacity-60">Убрать</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploading}
              onClick={() => { haptic.tap(); fileRef.current?.click() }}
              className="tap r-card mx-[16px] flex h-[96px] w-[calc(100%-32px)] flex-col items-center justify-center gap-[6px] border border-dashed border-text/20 bg-surface text-text-2 disabled:opacity-60"
            >
              {uploading ? <span className="h-[20px] w-[20px] animate-spin rounded-full border-2 border-current border-t-transparent" /> : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M8.2 6.5 9.3 4.8c.3-.5.8-.8 1.4-.8h2.6c.6 0 1.1.3 1.4.8l1.1 1.7H18a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3h2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.7" />
                </svg>
              )}
              <span className="text-[14px] font-semibold leading-[18px]">{uploading ? 'Загружаем' : 'Добавить картинку'}</span>
            </button>
          )}
          {imageError ? <Note tone="danger">{imageError}</Note> : !previewImage && <Note>Можно и без неё.</Note>}

          <FormLabel>Как это увидят в Telegram</FormLabel>
          <TelegramPost text={postText(title, description, plans)} button={buttonText.trim() || DEFAULT_BUTTON} image={previewImage} />
      {error && <Note tone="danger">{error.message}</Note>}
    </Screen>
  )
}
