import { ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  src: string | null
  alt: string
  className?: string
}

/** Product photo with a neutral placeholder when there is none or it fails to load (e.g. offline). */
export function ProductImage({ src, alt, className }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && src !== failedSrc

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground/50',
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <ImageIcon className="size-1/3 max-h-8 max-w-8" aria-hidden />
      )}
    </span>
  )
}
