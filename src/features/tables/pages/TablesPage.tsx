import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTenantAccess } from '../../../shared/access/useTenantAccess'
import { KpiGrid, PageTitle, StatCard } from '../../../shared/ui/Display'
import { FilterBar, FilterSelect } from '../../../shared/ui/FilterBar'
import { Icon } from '../../../shared/ui/Icon'
import { EmptyState, ErrorState, LoadingSkeleton, Pagination } from '../../../shared/components/AdminUi'
import { useRealtimeStatus } from '../../../shared/realtime/RealtimeContext'
import { tablesAdminApi, tableKeys } from '../api/tablesAdminApi'
import { AreasDrawer } from '../components/AreasDrawer'
import { TableDetailDrawer } from '../components/TableDetailDrawer'
import { TableFormDrawer } from '../components/TableFormDrawer'
import { canTable } from '../policies/tableAccessPolicy'
import type { RestaurantTable } from '../schemas'
import { elapsedSince, tableState, tableStateLabels, type TableState } from '../utils/tableLabels'
import '../tables.css'

const NO_AREA = 'none'

type Dialog = { kind: 'areas' } | { kind: 'create' } | { kind: 'edit'; tableId: string } | null

/**
 * Sơ đồ bàn: tables grouped by area with live state (Trống / Đang phục vụ /
 * Ngưng dùng). A table opens a side panel for its session, QR and settings.
 */
export function TablesPage() {
  const { access, scope } = useTenantAccess()
  const realtime = useRealtimeStatus()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<Dialog>(null)
  const area = params.get('area') ?? ''
  const status = (params.get('state') ?? '') as TableState | ''
  const q = params.get('q') ?? ''
  const selectedId = params.get('table')
  const setParam = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: key !== 'table' },
    )

  const areas = useQuery({
    queryKey: tableKeys.areas(scope),
    queryFn: ({ signal }) => tablesAdminApi.areas(scope!, signal),
    enabled: !!scope,
  })
  const tables = useQuery({
    queryKey: tableKeys.tablePage(scope, page),
    queryFn: ({ signal }) => tablesAdminApi.tables(scope!, page, signal),
    enabled: !!scope,
    // Occupancy changes with orders; without the socket, refresh every 30 s.
    refetchInterval: realtime.state === 'connected' ? false : 30_000,
    refetchOnWindowFocus: realtime.state !== 'connected',
  })
  const all = useMemo(() => tables.data?.content ?? [], [tables.data])
  const areaList = useMemo(() => areas.data?.content ?? [], [areas.data])
  const tableCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const table of all) if (table.area) counts.set(table.area.id, (counts.get(table.area.id) ?? 0) + 1)
    return counts
  }, [all])

  const needle = q.trim().toLowerCase()
  const visible = all.filter(
    (table) =>
      (!area || (area === NO_AREA ? !table.area : table.area?.id === area)) &&
      (!status || tableState(table) === status) &&
      (!needle || table.name.toLowerCase().includes(needle) || table.code.toLowerCase().includes(needle)),
  )
  const counts = { serving: 0, empty: 0, inactive: 0 }
  for (const table of all) counts[tableState(table)]++

  // Group by area in floor order; tables without an area come last.
  const groups = [
    ...areaList.map((a) => ({ id: a.id, name: a.name, active: a.active, tables: visible.filter((t) => t.area?.id === a.id) })),
    { id: NO_AREA, name: 'Chưa phân khu', active: true, tables: visible.filter((t) => !t.area) },
  ].filter((group) => group.tables.length > 0)

  const selected = all.find((table) => table.id === selectedId) ?? null
  const editing = dialog?.kind === 'edit' ? all.find((table) => table.id === dialog.tableId) ?? null : null

  return (
    <div className="ui-page">
      <PageTitle
        title="Sơ đồ bàn"
        description="Bấm vào một bàn để mở bàn, gọi món, chuyển bàn hoặc in mã QR."
        actions={
          <>
            {(canTable(access, 'TABLE_CREATE') || canTable(access, 'TABLE_UPDATE')) && (
              <button type="button" className="button button-ghost" onClick={() => setDialog({ kind: 'areas' })}>
                Khu vực
              </button>
            )}
            {canTable(access, 'TABLE_CREATE') && (
              <button type="button" className="button button-primary" onClick={() => setDialog({ kind: 'create' })}>
                <Icon name="plus" size={16} /> Thêm bàn
              </button>
            )}
          </>
        }
      />
      <KpiGrid columns={4}>
        <StatCard label="Tổng số bàn" value={all.length} icon="table" loading={tables.isLoading} />
        <StatCard label="Đang phục vụ" value={counts.serving} icon="staff" tone="warning" loading={tables.isLoading} onClick={() => setParam('state', status === 'serving' ? '' : 'serving')} />
        <StatCard label="Bàn trống" value={counts.empty} icon="check" tone="success" loading={tables.isLoading} onClick={() => setParam('state', status === 'empty' ? '' : 'empty')} />
        <StatCard label="Ngưng dùng" value={counts.inactive} icon="lock" tone="neutral" loading={tables.isLoading} onClick={() => setParam('state', status === 'inactive' ? '' : 'inactive')} />
      </KpiGrid>
      <FilterBar
        search={q}
        onSearch={(value) => setParam('q', value)}
        searchPlaceholder="Tìm theo tên hoặc mã bàn"
        isFiltered={!!(area || status || q)}
        onReset={() => setParams({}, { replace: true })}
      >
        <FilterSelect
          label="Khu vực"
          value={area}
          options={[{ value: '', label: 'Tất cả khu' }, ...areaList.map((a) => ({ value: a.id, label: a.name })), { value: NO_AREA, label: 'Chưa phân khu' }]}
          onChange={(value) => setParam('area', value)}
        />
        <FilterSelect<TableState>
          label="Tình trạng"
          value={status}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'serving', label: 'Đang phục vụ' },
            { value: 'empty', label: 'Trống' },
            { value: 'inactive', label: 'Ngưng dùng' },
          ]}
          onChange={(value) => setParam('state', value)}
        />
      </FilterBar>

      {tables.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : tables.error && !tables.data ? (
        <ErrorState error={tables.error} onRetry={() => void tables.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState title="Chưa có bàn nào" description="Thêm bàn để nhận khách tại chỗ và in mã QR gọi món." />
      ) : groups.length === 0 ? (
        <EmptyState title="Không có bàn phù hợp" description="Thử đổi bộ lọc." />
      ) : (
        groups.map((group) => (
          <section key={group.id} className="tables-group" aria-label={group.name}>
            <h2>
              {group.name}
              {!group.active && <span className="ui-badge ui-badge-neutral">Khu đang tắt</span>}
              <span className="ui-muted-cell">{group.tables.length} bàn</span>
            </h2>
            <div className="tables-grid">
              {group.tables.map((table) => (
                <TableCard key={table.id} table={table} selected={table.id === selectedId} onOpen={() => setParam('table', table.id)} />
              ))}
            </div>
          </section>
        ))
      )}
      <Pagination page={page} totalPages={tables.data?.totalPages ?? 0} onPageChange={setPage} />

      {selected && !dialog && (
        <TableDetailDrawer
          table={selected}
          allTables={all}
          onEdit={() => setDialog({ kind: 'edit', tableId: selected.id })}
          onClose={() => setParam('table', '')}
        />
      )}
      {dialog?.kind === 'areas' && <AreasDrawer areas={areaList} tableCounts={tableCounts} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'create' && (
        <TableFormDrawer table={null} areas={areaList} defaultAreaId={area && area !== NO_AREA ? area : undefined} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'edit' && editing && (
        <TableFormDrawer table={editing} areas={areaList} onClose={() => setDialog(null)} onReload={() => void tables.refetch().then(() => setDialog(null))} />
      )}
    </div>
  )
}

function TableCard({ table, selected, onOpen }: { table: RestaurantTable; selected: boolean; onOpen: () => void }) {
  const state = tableState(table)
  return (
    <button type="button" className={`tables-card tables-card-${state}${selected ? ' tables-card-selected' : ''}`} onClick={onOpen}>
      <span className="tables-card-head">
        <strong>{table.name}</strong>
        <span className="tables-card-code">{table.code}</span>
      </span>
      <span className="tables-card-state">{tableStateLabels[state].label}</span>
      <span className="tables-card-meta">
        {table.currentSession ? (
          <>
            {table.currentSession.guestCount} khách · {elapsedSince(table.currentSession.openedAt)}
          </>
        ) : (
          <>{table.capacity} chỗ</>
        )}
      </span>
    </button>
  )
}
