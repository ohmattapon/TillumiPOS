/** One page of a list, with the size of the whole list it was cut from. */
export interface Page<T> {
  items: T[]
  /** How many items match in total, not how many are in `items`. */
  total: number
}
