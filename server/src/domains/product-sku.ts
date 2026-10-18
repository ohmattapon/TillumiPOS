/** Stable catalogue code; padding is a minimum width, not a limit. */
export const formatProductSku = (number: number): string => `SKU-${String(number).padStart(6, '0')}`
