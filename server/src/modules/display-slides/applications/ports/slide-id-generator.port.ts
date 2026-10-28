/** Mints fresh storage names for slide uploads, so the core never touches crypto directly. */
export interface ISlideIdGenerator {
  /** A fresh UUID for one upload; the caller shapes it into the storage key. */
  newId(): string
}

const slideIdGeneratorTokenSymbol: unique symbol = Symbol('ISlideIdGenerator')
export const slideIdGeneratorToken = slideIdGeneratorTokenSymbol.toString()
