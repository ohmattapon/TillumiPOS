const BAR_WIDTHS = ['w-3/4', 'w-1/2', 'w-5/6', 'w-2/5', 'w-2/3'] as const

/** Width class for a placeholder line. Lines of text do not all end at the same place, so this varies them predictably. */
export function barWidth(index: number): (typeof BAR_WIDTHS)[number] {
  return BAR_WIDTHS[((index % BAR_WIDTHS.length) + BAR_WIDTHS.length) % BAR_WIDTHS.length]!
}
