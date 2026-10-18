/** Whether the from and to days (`YYYY-MM-DD`, or empty for no limit) are in order. ISO dates compare as text. */
export const isRangeInOrder = (from: string, to: string): boolean => from === '' || to === '' || from <= to
