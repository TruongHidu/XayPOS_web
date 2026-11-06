import type { z } from 'zod'
import { packageFormSchema } from '../schemas'
import type { AdminPackageResponse, CreatePackageRequest, UpdatePackageRequest } from '../../../shared/types/admin'

export type PackageFormValues = z.infer<typeof packageFormSchema>

export function packageFormDefaults(item: AdminPackageResponse | null): PackageFormValues {
  return {
    code: item?.code ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    priceAmount: item ? String(item.priceAmount) : '',
    currencyCode: item?.currencyCode ?? 'VND',
    billingCycleMonths: String(item?.billingCycleMonths ?? 1),
    active: item?.active ?? true,
    staffLimitMode: item?.maxStaff != null ? 'limited' : 'unlimited',
    maxStaff: item?.maxStaff != null ? String(item.maxStaff) : '',
    selectedFeatureCodes: item?.features.map((feature) => feature.code) ?? [],
  }
}

export function mapPackageRequest(values: PackageFormValues, mode: 'create'): CreatePackageRequest
export function mapPackageRequest(values: PackageFormValues, mode: 'update'): UpdatePackageRequest
export function mapPackageRequest(
  values: PackageFormValues,
  mode: 'create' | 'update',
): CreatePackageRequest | UpdatePackageRequest {
  const parsed = packageFormSchema.parse(values)
  const common = {
    name: parsed.name,
    description: parsed.description.trim() || null,
    priceAmount: Number(parsed.priceAmount),
    currencyCode: parsed.currencyCode.toUpperCase(),
    billingCycleMonths: Number(parsed.billingCycleMonths),
    maxStaff: parsed.staffLimitMode === 'unlimited' ? null : Number(parsed.maxStaff),
    features: parsed.selectedFeatureCodes.map((code) => ({ code })),
  }
  return mode === 'create' ? { code: parsed.code.toUpperCase(), ...common } : { ...common, active: parsed.active }
}
