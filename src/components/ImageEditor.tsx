import { useRef, useState } from 'react'

type ImageEditorProps = {
  imageSrc: string | null
  emptyText: string
  canEdit: boolean
  chooseLabel: string
  replaceLabel?: string
  removeLabel: string
  accept?: string
  onSelectImage: (file: File) => void
  onRemoveImage: () => void
  onBeforeEdit?: () => boolean
}

export default function ImageEditor({
  imageSrc,
  emptyText,
  canEdit,
  chooseLabel,
  replaceLabel,
  removeLabel,
  accept = 'image/*',
  onSelectImage,
  onRemoveImage,
  onBeforeEdit,
}: ImageEditorProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageError = !imageSrc || failedSrc === imageSrc

  const handleChoose = () => {
    if (!canEdit) return
    if (onBeforeEdit && onBeforeEdit()) return
    inputRef.current?.click()
  }

  const handleRemove = () => {
    if (!canEdit) return
    if (onBeforeEdit && onBeforeEdit()) return
    onRemoveImage()
  }

  return (
    <>
      <div className="oauth2-image">
        {!imageError && imageSrc && <img src={imageSrc} alt="" onError={() => setFailedSrc(imageSrc)} />}
        {imageError && <span className="muted-text">{emptyText}</span>}
        {canEdit && (
          <div className="panel-actions">
            <button className="secondary-button" type="button" onClick={handleChoose}>
              {!imageError && imageSrc && replaceLabel ? replaceLabel : chooseLabel}
            </button>
            {!imageError && imageSrc && (
              <button className="ghost-button" type="button" onClick={handleRemove}>
                {removeLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {canEdit && (
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept={accept}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              onSelectImage(file)
            }
            event.currentTarget.value = ''
          }}
        />
      )}
    </>
  )
}
