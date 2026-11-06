import { useSyncExternalStore } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { remoteRevision } from './queryInvalidator'

export function useRemoteRevision(key: QueryKey) {
  const client = useQueryClient()
  return useSyncExternalStore(
    (listener) => client.getQueryCache().subscribe(listener),
    () => remoteRevision(client.getQueryCache().find({ queryKey: key, exact: true })),
  )
}
