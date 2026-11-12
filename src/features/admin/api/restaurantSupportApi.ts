import { api } from '../../../shared/api/httpClient'
import type { RestaurantNote, RestaurantUsage } from '../../../shared/types/adminPayments'

const base = (restaurantId: string) => `/admin/restaurants/${encodeURIComponent(restaurantId)}`

export const restaurantSupportApi = {
  usage: (restaurantId: string) => api.get<RestaurantUsage>(`${base(restaurantId)}/usage`).then((r) => r.data),
  notes: (restaurantId: string) => api.get<RestaurantNote[]>(`${base(restaurantId)}/notes`).then((r) => r.data),
  addNote: (restaurantId: string, content: string) =>
    api.post<RestaurantNote>(`${base(restaurantId)}/notes`, { content }).then((r) => r.data),
  deleteNote: (restaurantId: string, noteId: string) =>
    api.delete<void>(`${base(restaurantId)}/notes/${encodeURIComponent(noteId)}`).then(() => undefined),
}
