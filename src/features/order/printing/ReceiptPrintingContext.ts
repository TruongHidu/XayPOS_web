import { createContext, useContext } from 'react'
import type { ReceiptRequest } from './loadReceipt'
export const ReceiptPrintingContext = createContext<{
  available: boolean
  openReceipt: (request: ReceiptRequest) => void
}>({ available: false, openReceipt: () => undefined })
export const useReceiptPrinting = () => useContext(ReceiptPrintingContext)
