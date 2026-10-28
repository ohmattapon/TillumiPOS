import { cn } from '@/lib/utils'

interface Props {
  src: string
  alt: string
  onError: () => void
  className?: string
}

/**
 * A slide shown whole, whatever the screen is: the picture is fitted inside the box, never cropped, and the
 * room that is left over is filled with a blurred, enlarged copy of the same picture instead of black bars.
 * The copy is the same URL, so the browser fetches it once.
 */
export function SlideImage({ src, alt, onError, className }: Props) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <img src={src} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-2xl" />
      <img
        src={src}
        alt={alt}
        onError={onError}
        className="relative size-full object-contain motion-safe:animate-in motion-safe:fade-in"
      />
    </div>
  )
}
