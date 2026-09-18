import { api } from '../../../shared/api/httpClient'
import type { AdminPackageResponse, CreatePackageRequest, PackageFeatureRequest, UpdatePackageRequest } from '../../../shared/types/admin'

export const packagesApi = {
  list: (includeInactive = true) => api.get<AdminPackageResponse[]>('/admin/packages', { params: { includeInactive } }).then((response) => response.data),
  getByCode: (packageCode: string) => api.get<AdminPackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}`).then((response) => response.data),
  create: (request: CreatePackageRequest) => api.post<AdminPackageResponse>('/admin/packages', request).then((response) => response.data),
  update: (packageCode: string, request: UpdatePackageRequest) => api.put<AdminPackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}`, request).then((response) => response.data),
  addFeature: (packageCode: string, featureCode: string, request: PackageFeatureRequest) => api.post<AdminPackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}/features/${encodeURIComponent(featureCode)}`, request).then((response) => response.data),
  removeFeature: (packageCode: string, featureCode: string) => api.delete<AdminPackageResponse>(`/admin/packages/${encodeURIComponent(packageCode)}/features/${encodeURIComponent(featureCode)}`).then((response) => response.data),
}
