/** The one source of random ids for the core. Any format around the raw value (a prefix, a folder) is a pure function in `domains/`. */
export interface IIdGenerator {
  /** A new random identifier made of letters, digits and hyphens. */
  newId(): string
}
