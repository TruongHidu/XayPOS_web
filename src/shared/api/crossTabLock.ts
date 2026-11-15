/**
 * Runs `task` while holding a lock shared by every tab of this origin.
 *
 * The refresh-token cookie is shared by all tabs and rotates on each use; the backend treats a second use of a
 * rotated token as theft and revokes every session. Serialising refreshes means the next tab always sends the
 * cookie the previous refresh just set. Browsers without the Web Locks API run the task directly.
 */
export function withCrossTabLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request) return task()
  return locks.request(name, task) as Promise<T>
}
