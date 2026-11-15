import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { useTenantMutation } from '../../../shared/api/useTenantMutation'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { Drawer } from '../../../shared/ui/Drawer'
import { Notice, Panel } from '../../../shared/ui/Display'
import { SelectField, TextField } from '../../../shared/ui/FormFields'
import { MutationError } from '../../../shared/ui/MutationError'
import { ErrorState, LoadingSkeleton } from '../../../shared/components/AdminUi'
import { tenantError } from '../../../shared/errors/tenantErrorMessages'
import { settingsApi, settingsKeys } from '../api/settingsApi'
import { normalizeAccountName, transferAccountFormSchema, type TransferAccount, type TransferAccountForm } from '../schemas'
import { bankLabel, vietnamBanks } from '../utils/settingsLabels'

/** The bank account the server uses to build each order's VietQR. */
export function TransferAccountSection({ canEdit }: { canEdit: boolean }) {
  const { scope } = useTenantAccess()
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const query = useQuery({
    queryKey: settingsKeys.transferAccount(scope),
    queryFn: ({ signal }) => settingsApi.transferAccount(scope!, signal),
    enabled: !!scope,
    retry: false,
  })
  const remove = useTenantMutation({
    mutationFn: (s) => settingsApi.removeTransferAccount(s),
    invalidate: (s) => [settingsKeys.transferAccount(s)],
    success: 'Đã gỡ tài khoản nhận chuyển khoản.',
    onSuccess: () => setConfirmRemove(false),
  })
  const account = query.data?.configured ? query.data : null
  return (
    <Panel
      title="Tài khoản nhận chuyển khoản"
      actions={
        canEdit && query.data ? (
          <div className="ui-inline-actions">
            <button type="button" className="button button-small button-ghost" onClick={() => setEditing(true)}>
              {account ? 'Đổi tài khoản' : 'Thêm tài khoản'}
            </button>
            {account && (
              <button type="button" className="button button-small button-danger" onClick={() => setConfirmRemove(true)}>
                Gỡ
              </button>
            )}
          </div>
        ) : null
      }
    >
      {query.isLoading ? (
        <LoadingSkeleton rows={2} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : account ? (
        <dl className="ui-facts">
          <dt>Ngân hàng</dt>
          <dd>{bankLabel(account.bankBin)}</dd>
          <dt>Số tài khoản</dt>
          <dd>{account.accountNumber}</dd>
          <dt>Chủ tài khoản</dt>
          <dd>{account.accountName}</dd>
        </dl>
      ) : (
        <Notice tone="info">
          Chưa có tài khoản nhận chuyển khoản. Khi có, màn hình thu tiền sẽ hiện mã VietQR đúng số tiền của đơn để khách quét.
        </Notice>
      )}
      {editing && <TransferAccountDrawer account={account} onClose={() => setEditing(false)} onReload={() => void query.refetch()} />}
      {confirmRemove && (
        <ConfirmDialog
          title="Gỡ tài khoản nhận chuyển khoản?"
          tone="danger"
          confirmLabel="Gỡ tài khoản"
          message="Màn hình thu tiền sẽ không còn hiện mã VietQR cho khách chuyển khoản."
          busy={remove.isPending}
          error={remove.error ? tenantError(remove.error).message : null}
          onConfirm={() => remove.mutate(undefined)}
          onCancel={() => setConfirmRemove(false)}
        />
      )}
    </Panel>
  )
}

function TransferAccountDrawer({ account, onClose, onReload }: { account: TransferAccount | null; onClose: () => void; onReload: () => void }) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TransferAccountForm>({
    resolver: zodResolver(transferAccountFormSchema),
    defaultValues: {
      bankBin: account?.bankBin ?? '',
      accountNumber: account?.accountNumber ?? '',
      accountName: account?.accountName ?? '',
    },
  })
  const name = useWatch({ control, name: 'accountName' })
  const save = useTenantMutation({
    mutationFn: (s, body: { bankBin: string; accountNumber: string; accountName: string }) => settingsApi.saveTransferAccount(s, body),
    invalidate: (s) => [settingsKeys.transferAccount(s)],
    success: 'Đã lưu tài khoản nhận chuyển khoản.',
    onSuccess: onClose,
  })
  const options = vietnamBanks.map((bank) => ({ value: bank.bin, label: `${bank.shortName} — ${bank.name}` }))
  if (account && !vietnamBanks.some((bank) => bank.bin === account.bankBin))
    options.unshift({ value: account.bankBin, label: `BIN ${account.bankBin}` })
  return (
    <Drawer
      title={account ? 'Đổi tài khoản nhận chuyển khoản' : 'Thêm tài khoản nhận chuyển khoản'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Hủy
          </button>
          <button type="submit" form="transfer-account-form" className="button button-primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <form
        id="transfer-account-form"
        noValidate
        onSubmit={handleSubmit((values) => save.mutate(transferAccountFormSchema.parse(values)))}
      >
        <SelectField label="Ngân hàng" required placeholder="Chọn ngân hàng" options={options} error={errors.bankBin?.message} {...register('bankBin')} />
        <TextField label="Số tài khoản" required inputMode="numeric" autoComplete="off" error={errors.accountNumber?.message} {...register('accountNumber')} />
        <TextField
          label="Tên chủ tài khoản"
          required
          autoComplete="off"
          hint={name ? `Sẽ lưu là: ${normalizeAccountName(name)}` : 'Nhập đúng như in trên thẻ/ứng dụng ngân hàng, không cần dấu.'}
          error={errors.accountName?.message}
          {...register('accountName')}
        />
        <Notice tone="warning">Tiền khách chuyển khoản sẽ vào tài khoản này. Kiểm tra kỹ số tài khoản trước khi lưu.</Notice>
        <MutationError error={save.error} onReload={onReload} />
      </form>
    </Drawer>
  )
}
