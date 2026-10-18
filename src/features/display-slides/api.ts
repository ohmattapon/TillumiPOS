import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api'

export const slideKeys = {
  all: ['display-slides'] as const,
}

const fetchSlides = () => unwrap(api['display-slides'].all.get())

export type DisplaySlide = Awaited<ReturnType<typeof fetchSlides>>['items'][number]

/** Every slide, including hidden ones: the owner manages here what the customer display shows. */
export const slidesQuery = queryOptions({
  queryKey: slideKeys.all,
  queryFn: fetchSlides,
})

export interface SlideChanges {
  sortOrder?: number
  isActive?: boolean
}

/** Uploading creates the slide; there is no standalone create (the image is the slide). */
export function useUploadSlide() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => unwrap(api['display-slides'].post({ file })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slideKeys.all }),
  })
}

export function useUpdateSlide() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: SlideChanges }) =>
      unwrap(api['display-slides']({ id }).patch(changes)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slideKeys.all }),
  })
}

export function useDeleteSlide() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => unwrap(api['display-slides']({ id }).delete()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slideKeys.all }),
  })
}
