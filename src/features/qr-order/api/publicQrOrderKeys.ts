export const publicQrOrderKeys = {
  scope: (scope: string) => ['qr-order', scope] as const,
  receipt: (scope: string, id: string) => ['qr-order', scope, 'receipt', id.toLowerCase()] as const,
}
