import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useQrDraftStore } from '../store/qrOrderDraftStore'
import { useQrGuestStore } from '../store/qrOrderGuestStore'
import { publicQrOrderKeys } from '../api/publicQrOrderKeys'
import { entryPath } from '../policies/qrOrderPolicy'
export function useQrOrderSubmit() {
  const client = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    const before = useQrGuestStore.getState()
    const receipt = await useQrDraftStore.getState().submit()
    if (receipt && before.entry && before.scopeId === useQrGuestStore.getState().scopeId) {
      client.setQueryDefaults(publicQrOrderKeys.scope(before.scopeId), { gcTime: 60 * 60 * 1000, retry: false })
      client.setQueryData(publicQrOrderKeys.receipt(before.scopeId, receipt.requestId), receipt)
      navigate(entryPath(before.entry) + '/requests/' + receipt.requestId)
    } else if (['ITEM_OUT_OF_STOCK', 'ITEM_NOT_SELLABLE'].includes(useQrDraftStore.getState().error?.code ?? '')) {
      void client.invalidateQueries({ queryKey: ['qr-menu', before.entry?.entryType, before.entry?.token] })
    }
  }
}
