import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { privateMenuApi } from '../../menu/api/privateMenuApi'
import { orderKeys } from '../api/orderKeys'
import { canMenu, canOrder } from '../policies/orderAccessPolicy'
import { useOrderAccess } from './useOrderAccess'
export function useOrderMenuPicker(permission: string) {
  const { access, scope } = useOrderAccess()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [groupId, setGroupId] = useState<string | undefined>()
  const [page, setPage] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim())
      setPage(0)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])
  const criteria = { q, groupId, page }
  const enabled = !!scope && canMenu(access) && canOrder(access, permission) && search.trim().length <= 100
  const items = useQuery({
    queryKey: orderKeys.menu(scope, criteria),
    queryFn: ({ signal }) => privateMenuApi.items(scope!, criteria, signal),
    enabled,
    retry: false,
  })
  const groups = useInfiniteQuery({
    queryKey: orderKeys.groups(scope),
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) => privateMenuApi.groups(scope!, pageParam, signal),
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
    enabled,
    retry: false,
  })
  return {
    items,
    groups,
    search,
    setSearch,
    groupId,
    setGroup: (id: string | undefined) => {
      setGroupId(id)
      setPage(0)
    },
    page,
    setPage,
    enabled,
  }
}
