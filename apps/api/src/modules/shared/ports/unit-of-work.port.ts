/**
 * Groups writes across several repositories into one all-or-nothing unit.
 * Repositories called inside `run` take part automatically; nothing is passed around.
 */
export interface IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>
}
