import { api } from '../../../shared/api/httpClient'
import type { CreateFeatureRequest, FeatureResponse, UpdateFeatureRequest } from '../../../shared/types/admin'

export const featuresApi = {
  list: (includeInactive = true) => api.get<FeatureResponse[]>('/admin/features', { params: { includeInactive } }).then((response) => response.data),
  getByCode: (featureCode: string) => api.get<FeatureResponse>(`/admin/features/${encodeURIComponent(featureCode)}`).then((response) => response.data),
  create: (request: CreateFeatureRequest) => api.post<FeatureResponse>('/admin/features', request).then((response) => response.data),
  update: (featureCode: string, request: UpdateFeatureRequest) => api.put<FeatureResponse>(`/admin/features/${encodeURIComponent(featureCode)}`, request).then((response) => response.data),
}
