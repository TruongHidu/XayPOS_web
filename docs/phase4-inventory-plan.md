# Phase 4 — Kho: kế hoạch triển khai

Mục tiêu: đưa toàn bộ phần Kho của app lên web, đúng contract backend, theo cùng kiến trúc của Phase 0–3 (section registry, `tenantApi`, `useTenantMutation`, UI kit `shared/ui`).

App Flutter có 4 mục sidebar cho Kho: **Tồn kho**, **Chứng từ kho**, **Cảnh báo tồn kho**, **Kiểm kê**. Ngoài ra có các trang con: Quản lý kho, Biến động kho, Tồn thấp, chi tiết chứng từ, chi tiết cảnh báo, chi tiết kiểm kê.

## 1. Nguồn contract

Tất cả nằm trong `XayPOS_be/docs/`:

- `inventory-api.md`: kho, số dư, ngưỡng, chứng từ, sổ biến động, giá vốn bình quân khi nhập.
- `direct-stock-menu-items-fe-sync.md`: hàng bán sẵn (MENU_ITEM trừ kho trực tiếp), trường `itemId`/`itemType`, `GET /inventory/stock-items`.
- `stock-audit-api.md` và `stock-audit-fe-sync.md`: kiểm kê.
- `low-stock-alert-api.md` và `low-stock-alert-fe-sync.md`: cảnh báo tồn thấp.
- `inventory-alert-realtime.md`: sự kiện realtime cảnh báo.
- `openapi/tenant-api.yaml`, mục `/api/v1/inventory/*`: shape đầy đủ để viết zod schema.

## 2. Route và section (giống app)

| Section (id app) | Route web | Trang | `canSee` |
| --- | --- | --- | --- |
| `inventory` | `/app/inventory/balances` | Tồn kho theo kho | `canInventory(INVENTORY_VIEW)` |
| (con của `inventory`) | `/app/inventory/warehouses` | Quản lý kho | như trên |
| (con của `inventory`) | `/app/inventory/transactions` | Biến động kho (lọc theo kho/hàng/chứng từ/đơn) | như trên |
| (con của `inventory-alerts`) | `/app/inventory/low-stock` | Tồn thấp hiện tại | `canViewInventoryAlerts` |
| `inventory-documents` | `/app/inventory/stock-documents`, `/new`, `/:documentId` | Chứng từ nhập/xuất/điều chỉnh | `canInventory(INVENTORY_VIEW)` |
| `inventory-alerts` | `/app/inventory/alerts`, `/:alertId` | Cảnh báo tồn thấp | `canViewInventoryAlerts` |
| `inventory-audits` | `/app/inventory/audits`, `/new`, `/:auditId` | Kiểm kê | `canViewStockAudits` |

- `/app/inventory` (và `?tab=...` của app) redirect sang route con tương ứng, giống `app_router.dart`.
- Thêm vào `LegacyCashierRedirect` thì không cần, vì web cũ không có kho.
- Badge sidebar của "Cảnh báo tồn kho" là số đợt cảnh báo OPEN (`GET /inventory/alerts?status=OPEN&size=1`).
- Thẻ "Nguyên liệu sắp hết" trên Tổng quan dùng `GET /inventory/low-stock?size=1`.

## 3. Quyền

File `features/inventory/policies/inventoryAccessPolicy.ts`, port từ `access_policy.dart`:

- `canInventory(a, perm)` = feature `INVENTORY_MANAGEMENT` + permission `perm`.
  - Các quyền con (ALERT_ACKNOWLEDGE, STOCK_AUDIT_*) còn cần thêm `INVENTORY_VIEW`.
  - `INVENTORY_ALERT_ACKNOWLEDGE` còn cần feature `LOW_STOCK_ALERT`.
  - `STOCK_AUDIT_*` còn cần feature `STOCK_AUDIT`.
- `canViewInventoryAlerts` = `INVENTORY_VIEW` + `LOW_STOCK_ALERT`; `canAcknowledgeInventoryAlert` thêm `INVENTORY_ALERT_ACKNOWLEDGE`.
- `canViewStockAudits` = `INVENTORY_VIEW` + `STOCK_AUDIT`; `canManageStockAudits` thêm `STOCK_AUDIT_MANAGE`; `canConfirmStockAudits` thêm `STOCK_AUDIT_CONFIRM`.
- Tạo, sửa, xác nhận, hủy chứng từ theo loại:
  - RECEIPT: `INVENTORY_RECEIVE`
  - ISSUE: `INVENTORY_ISSUE`
  - ADJUSTMENT: `INVENTORY_ADJUST`
- Kho: `WAREHOUSE_CREATE`, `WAREHOUSE_UPDATE`, `WAREHOUSE_DELETE`. Ngưỡng: `INVENTORY_THRESHOLD_UPDATE`.
- **Vai trò**:
  - Như các phase trước, các màn kho đi theo permission × feature, không chặn thu ngân như app.
  - Riêng kênh realtime cảnh báo vẫn theo allowlist vai trò của backend (OWNER/MANAGER/WAITER/KITCHEN; đã có sẵn trong `channelPolicy.ts`). Thu ngân có quyền vẫn xem được trang, chỉ không nhận realtime mà nhận bằng polling.

## 4. Cấu trúc module

```
src/features/inventory/
  api/inventoryApi.ts       kho, số dư, ngưỡng, low-stock, stock-items, transactions
  api/stockDocumentsApi.ts  chứng từ + dòng + confirm/cancel (Idempotency-Key khi tạo)
  api/alertsApi.ts          danh sách, chi tiết, acknowledge
  api/auditsApi.ts          kiểm kê + items + count batch
  api/inventoryKeys.ts      ['tenant', scope, 'inventory', ...]
  schemas.ts                zod; số lượng dùng nonNegativeQuantitySchema, có itemId/itemType (V40)
  policies/inventoryAccessPolicy.ts
  utils/inventoryLabels.ts  nhãn loại phiếu, trạng thái, lý do kết thúc cảnh báo, mã lỗi
  utils/quantity.ts         format "1.250,5 g", không bao giờ quy đổi đơn vị
  hooks/useWarehouseSelection.ts  kho đang chọn (URL ?warehouseId=, mặc định kho default)
  realtime/inventoryAdapter.ts
  components/…  pages/…  inventory.css
```

Query key dùng module `inventory`. Sau khi xác nhận chứng từ hoặc kiểm kê thì invalidate:

- số dư, low-stock, transactions, alerts;
- danh sách nguyên liệu `menu-admin` (vì `costPrice` bình quân đổi);
- menu POS (`orderKeys.menus`).

## 5. Từng màn hình

### 5.1 Tồn kho (`/app/inventory/balances`)

- Thanh chọn kho ở đầu trang: kho mặc định được chọn sẵn và có nhãn "Mặc định". Link "Quản lý kho" dẫn sang `/app/inventory/warehouses`.
- `DataTable` số dư `GET /warehouses/{id}/balances`:
  - Cột: hàng hóa (tên, SKU, nhãn "Hàng bán sẵn" khi `itemType=MENU_ITEM`), tồn vật lý, đang giữ cho đơn, khả dụng, ngưỡng, trạng thái (Tồn thấp / Bình thường / Chưa đặt ngưỡng).
  - Bộ lọc: tìm kiếm, "Chỉ hàng đang dùng", "Chỉ tồn thấp" (gọi `/low-stock?warehouseId=`).
  - Sắp xếp theo tên, SKU, tồn, ngưỡng, thời gian cập nhật.
- Thao tác mỗi dòng:
  - **Đặt ngưỡng**: dialog nhập `minQuantity`. Gửi `expectedVersion=null` khi số dư chưa có row (`configured=false`, `version=null`), gửi version hiện có khi đã có row. Ghi chú "0 = tắt cảnh báo".
  - **Lịch sử**: mở Biến động kho đã lọc theo kho và hàng hóa.
  - **Nhập thêm**: mở form tạo phiếu nhập, điền sẵn kho và hàng.
- Trạng thái rỗng: nếu chưa có kho thì hướng dẫn "Tạo kho đầu tiên"; nếu chưa có hàng theo dõi tồn thì link sang Thực đơn → Nguyên liệu.

### 5.2 Quản lý kho (`/app/inventory/warehouses`)

- Danh sách kho (mã, tên, mặc định, trạng thái). Drawer thêm/sửa: mã tự viết hoa, tên.
- Các thao tác bật/tắt, "Đặt làm mặc định", xóa đều có xác nhận và giải thích các lỗi:
  - `WAREHOUSE_HAS_RESERVATIONS`
  - không tắt được kho mặc định
  - không tắt hoặc xóa được kho còn tồn

### 5.3 Chứng từ kho

- **Danh sách**:
  - Lọc theo loại (Nhập / Xuất / Điều chỉnh), trạng thái (Nháp / Đã xác nhận / Đã hủy), kho, khoảng ngày tạo và mã phiếu.
  - Phiếu sinh từ kiểm kê (`stockAuditId != null`) có nhãn "Từ kiểm kê" và chỉ đọc.
- **Tạo** (`/new?type=RECEIPT&warehouseId=`):
  - Chọn loại phiếu và kho. Đổi loại hoặc kho thì hỏi trước khi xóa các dòng đã nhập.
  - Thêm dòng bằng ô tìm `GET /inventory/stock-items` (nguyên liệu và hàng bán sẵn). Mỗi dòng: số lượng theo đơn vị gốc; đơn giá nhập (chỉ RECEIPT, cảnh báo khi bằng 0 vì giá 0 vẫn kéo giá bình quân xuống); hướng tăng/giảm (chỉ ADJUSTMENT); ghi chú.
  - Gửi `POST` với `Idempotency-Key` sinh một lần cho mỗi lần bấm lưu, giữ nguyên khi thử lại sau timeout. Nếu chưa rõ kết quả thì hiện "Thử lại yêu cầu ban đầu", giống app.
  - Sau khi lưu nháp có hai nút: "Xác nhận ngay" hoặc "Để nháp".
- **Chi tiết**:
  - Header gồm mã, loại, kho, trạng thái, tổng số lượng và tổng tiền.
  - Phiếu nháp: sửa ghi chú, thêm/sửa/xóa dòng (mỗi thao tác gửi `expectedVersion` mới nhất), xác nhận, hủy.
  - Lỗi xác nhận cần thông báo rõ: `INSUFFICIENT_AVAILABLE_STOCK` (xuất nhiều hơn khả dụng vì đang giữ cho đơn), `STOCK_DOCUMENT_EMPTY`, `INGREDIENT_INACTIVE_FOR_RECEIPT`, `STOCK_DOCUMENT_MANAGED_BY_AUDIT`.
  - Phiếu đã xác nhận: link sang Biến động kho lọc theo chứng từ.

### 5.4 Biến động kho (`/app/inventory/transactions`)

- Sổ append-only `GET /transactions` với bộ lọc kho, hàng hóa, chứng từ, đơn, loại giao dịch, khoảng ngày. Bộ lọc nằm trên URL nên có thể mở thẳng từ các màn khác.
- Cột: thời điểm, hàng hóa, loại (Nhập / Xuất / Điều chỉnh tăng-giảm / Bán theo công thức), thay đổi (màu +/−), tồn trước → sau, đơn giá, nguồn (link chứng từ hoặc link đơn).
- `unitCost=null` hiển thị "Chưa có giá", không hiện 0.

### 5.5 Cảnh báo tồn thấp

- Tab: Chưa xem (OPEN) / Đã xem (ACKNOWLEDGED) / Đã kết thúc (RESOLVED) / Tất cả. Lọc theo kho, tìm kiếm, khoảng thời gian.
- Dòng cảnh báo gồm:
  - số liệu lúc phát cảnh báo: tồn và ngưỡng;
  - số liệu hiện tại: tồn, đang giữ, khả dụng, ngưỡng; nếu `null` thì hiện "Không còn dữ liệu so sánh";
  - thời điểm phát và lý do kết thúc.
- Nút **Đã xem** (acknowledge, gửi `expectedVersion`). Không dùng chữ "Đã nhập kho" cho nút này.
- Trang chi tiết: lịch sử của đợt cảnh báo, các link "Nhập kho" (form phiếu nhập điền sẵn), "Lịch sử giao dịch" và "Đặt ngưỡng".
- Trang **Tồn thấp** (`/low-stock`): danh sách số dư đang thấp ngay lúc này, khác với lịch sử cảnh báo.

### 5.6 Kiểm kê

- **Danh sách**: lọc theo kho, trạng thái (Nháp / Đang đếm / Đã chốt / Đã hủy), mã phiếu.
- **Tạo**: chọn kho đang hoạt động và ghi chú, gửi `Idempotency-Key`. Trang có nhắc "nên kiểm kê lúc ít giao dịch".
- **Chi tiết**:
  - **Nháp**: nút "Bắt đầu đếm". Hộp xác nhận giải thích rằng hệ thống chốt toàn bộ hàng đang theo dõi tồn và nhập/xuất/chế biến sau đó sẽ buộc phải đếm lại.
  - **Phiếu đếm**:
    - Bảng phân trang (size 100) với cột tồn hệ thống, số đếm, chênh lệch và ghi chú dòng.
    - Lọc: chưa đếm / đã đếm / chỉ dòng chênh lệch, cùng ô tìm kiếm.
    - Ô chưa đếm để trống, không tự điền 0.
    - Nút "Khớp với hệ thống" cho từng dòng để điền nhanh số tồn hệ thống.
  - **Lưu**: chỉ gửi các dòng đã sửa, tối đa 100 dòng mỗi batch, gửi tuần tự và lấy version mới sau mỗi batch. Có đếm "x dòng chưa lưu". Rời trang khi còn dòng chưa lưu thì hỏi lại; dùng cơ chế `useBlocker` thay cho `onExit` của app.
  - **Chốt**: chỉ bật khi đã đếm hết và có quyền chốt. Các lỗi chính:
    - `STOCK_AUDIT_SNAPSHOT_STALE`: giữ số đã nhập để tham khảo, hướng dẫn hủy phiên rồi tạo phiên mới.
    - `INSUFFICIENT_AVAILABLE_STOCK`: số đếm thấp hơn lượng đang giữ cho đơn.
    - `STOCK_AUDIT_INCOMPLETE`.
  - **Đã chốt**: chỉ đọc, link tới phiếu điều chỉnh tự sinh (`adjustmentDocumentId`). Nếu `null` thì hiện "Không có chênh lệch".
  - **Hủy phiên**: có ô ghi chú lý do.

## 6. Realtime và thông báo

- `shared/realtime/events.ts`: thêm event `INVENTORY_LOW_STOCK_ALERT_CHANGED` (resource `LOW_STOCK_ALERT`, payload `warehouseId`, `ingredientId` | `itemId`, `status`, `resolutionReason`).
- `StaffRealtimeBoundary`:
  - Bật kênh `inventory` khi user có quyền xem cảnh báo, dù đang ở trang nào.
  - Khi có sự kiện: invalidate alerts, low-stock, balances.
  - Nếu là đợt OPEN mới thì hiện toast "Nguyên liệu X dưới ngưỡng tại kho Y". Các sự kiện trong 400 ms được gom lại, giống app.
- Khi kết nối lại thì đọc lại qua REST, vì backend không phát lại sự kiện cũ. Khi realtime tắt thì badge và trang cảnh báo polling 60 giây/lần.

## 7. Dùng lại / bổ sung chung

- **Dùng lại**: `DataTable`, `FilterBar` + `useUrlCriteria`, `Drawer`, `ConfirmDialog`, `QuantityField` (3 số lẻ, cho phép 0), `MutationError` (nút tải lại khi xung đột version), `idempotencyHeaders(newIdempotencyKey())`.
- **Bổ sung**:
  - `ItemPicker` dùng chung (ô tìm kiếm có gợi ý) cho chứng từ và kiểm kê. Phase 1 đã có picker nguyên liệu trong `RecipeFormDrawer`; tách ra `shared/ui/AsyncPicker.tsx` để dùng chung.
  - `useUnsavedChangesGuard` cho phiếu đếm và form chứng từ.
- `IngredientDrawer` của Phase 1: sau khi có kho, hiển thị "Giá vốn được cập nhật theo bình quân khi xác nhận phiếu nhập".

## 8. Thứ tự làm

1. Schemas, API, keys, policy, nhãn và mã lỗi, cùng test API/policy.
2. Quản lý kho và Tồn kho (gồm ngưỡng). Đây là nền cho các màn sau.
3. Chứng từ: danh sách, tạo (idempotent), chi tiết và thao tác dòng/xác nhận/hủy. Sau đó Biến động kho.
4. Cảnh báo và Tồn thấp; realtime, badge, thẻ Tổng quan.
5. Kiểm kê: tạo, bắt đầu, phiếu đếm theo batch, chốt, hủy.
6. Cập nhật `sections.tsx`, `docs/app-parity.md`; chạy lint/test/build và kiểm tra trên trình duyệt.

## 9. Kiểm thử

Test vitest + MSW, mỗi nhóm một file:

- **Policy**: bảng permission × feature (đặc biệt các quyền con cần thêm `INVENTORY_VIEW` và feature).
- **Ngưỡng**: `expectedVersion=null` cho số dư chưa có row và version thật cho số dư đã có row.
- **Tạo chứng từ**: gửi `Idempotency-Key`; thử lại sau lỗi 5xx dùng lại đúng key và body; đổi nội dung thì sinh key mới.
- **Xác nhận chứng từ**:
  - Lỗi `INSUFFICIENT_AVAILABLE_STOCK` hiện thông báo rõ.
  - Phiếu "Từ kiểm kê" không có nút thao tác.
- **Cảnh báo**:
  - "Đã xem" gửi version hiện tại.
  - Số liệu hiện tại `null` hiện "Không còn dữ liệu so sánh".
  - Sự kiện realtime OPEN làm danh sách tải lại và hiện toast.
- **Kiểm kê**:
  - Ô trống không bị gửi thành 0.
  - Lưu nhiều batch gửi tuần tự và dùng version mới nhất.
  - `STOCK_AUDIT_SNAPSHOT_STALE` giữ dữ liệu đã nhập và hướng dẫn hủy/làm lại.
  - Nút chốt chỉ bật khi đã đếm hết.

Chạy thật với backend (khi bật được):

- Nhập 10 → xuất 3 → kiểm tra số dư và biến động.
- Đặt ngưỡng → xuất xuống dưới ngưỡng → thấy cảnh báo realtime trên tab thứ hai.
- Kiểm kê lệch 2 → chốt → có phiếu điều chỉnh tự sinh.

## 10. Rủi ro / lưu ý

- Contract V40 đổi tên field sang `itemId`/`itemType` nhưng vẫn giữ alias `ingredientId`. Schema web nhận cả hai, dùng `itemId` làm định danh, hiển thị nhãn chung "Hàng hóa".
- Không quy đổi đơn vị ở bất kỳ đâu (kg/g, thùng/lon). Mọi số lượng theo đơn vị gốc của hàng.
- Phiếu đếm có thể dài hàng trăm dòng. Dùng phân trang server (size 100) cùng trạng thái "dòng chưa lưu" giữ theo `auditItemId` qua các trang.
- Phase 5 (Sổ thu chi) sẽ dùng lại danh sách phiếu nhập đã xác nhận để liên kết phiếu chi, nên giữ `stockDocumentsApi` độc lập với trang.
