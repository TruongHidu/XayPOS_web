# Đối chiếu chức năng App (Flutter) ↔ Web (React)

Tài liệu này theo dõi việc đưa toàn bộ chức năng của app `pos_saas_app` lên web. Portal nhà hàng dùng `/app/*` với đường dẫn giống hệt app. Link cũ `/cashier/*` vẫn tự chuyển hướng: `/cashier/pos` sang `/app/order-create`, `/cashier/orders[/:id]` sang `/app/orders[/:id]`, các link còn lại sang `/app/home`.

Nguồn sự thật của sidebar, route, guard và trang mặc định sau đăng nhập là `src/portals/app/sections.tsx`.

## Trạng thái

| Section (id app)           | Nhóm sidebar        | Route web                            | Trạng thái       | Phase | API chính                                                                      |
| -------------------------- | ------------------- | ------------------------------------ | ---------------- | ----- | ------------------------------------------------------------------------------ |
| `overview`                 | Bán hàng & vận hành | `/app/overview`                      | Đã có         | 3     | `/reports/daily`, đếm đơn mang đi / QR / sắp hết                               |
| `orders`                   | Bán hàng & vận hành | `/app/orders`, `/app/orders/:id`     | Đã có            | –     | `/orders`, `/orders/{id}/*`, `/qr-order-requests`                              |
| `order-create`             | Bán hàng & vận hành | `/app/order-create`                  | Đã có (POS)      | 2     | `/orders`, `/tables`, `/table-areas`, `/menu/*`      |
| `takeaway-orders`          | Bán hàng & vận hành | `/app/takeaway[/:id]`                | Đã có         | 2     | `/orders?serviceType=TAKEAWAY`                                                 |
| `kitchen-display`          | Bếp                 | `/app/kitchen`                       | Đã có         | 2     | `/kitchen/items`, `/orders/{id}/items/{line}/start-cooking`, `.../mark-ready`  |
| `staff`                    | Quản lý             | `/app/staff`                         | Đã có         | 1     | `/staff`, `/staff/roles`, `/staff/permissions`, `/staff/{id}/*`                |
| `menu`                     | Quản lý             | `/app/menu`, `.../items/:id/recipes` | Đã có         | 1     | `/menu/groups`, `/menu/items`, `/menu/images`, `/menu/ingredients`, recipes    |
| `tables`                   | Quản lý             | `/app/tables`                        | Đã có         | 1     | `/table-areas`, `/tables`, `/tables/{id}/qr*`, `/table-sessions/*`             |
| `daily-revenue`            | Báo cáo             | `/app/daily-revenue`                 | Đã có         | 3     | `/reports/daily`                                                               |
| `reports`                  | Báo cáo             | `/app/reports`                       | Đã có         | 3     | `/reports/summary`, `revenue-series`, `payment-methods`, `top-items`, `orders` |
| `reference-margin-reports` | Báo cáo             | `/app/reference-margin`              | Đã có         | 3     | `/reports/reference-margin/{summary,series,orders}`                            |
| `cashbook`                 | Báo cáo             | `/app/cashbook`                      | Chưa làm         | 5     | `/cashbook/*`                                                                  |
| `inventory`                | Kho                 | `/app/inventory/balances`, `.../warehouses`, `.../transactions`, `.../low-stock` | Chưa làm | 4 | `/inventory/warehouses*`, `/inventory/transactions`, `/inventory/low-stock` |
| `inventory-documents`      | Kho                 | `/app/inventory/stock-documents[/new\|/:id]` | Chưa làm | 4     | `/inventory/stock-documents*`                                                  |
| `inventory-alerts`         | Kho                 | `/app/inventory/alerts[/:id]`        | Chưa làm         | 4     | `/inventory/alerts*`, realtime `/user/queue/inventory-alerts`                  |
| `inventory-audits`         | Kho                 | `/app/inventory/audits[/new\|/:id]`  | Chưa làm         | 4     | `/inventory/audits*`                                                           |
| `settings`                 | Tài khoản           | `/app/settings`                      | Đã có         | 1     | `/restaurants/me`, `/restaurants/me/menu-link`, `/restaurants/me/transfer-account` |

Phase 3 (đã xong):

- **Tổng quan** (`/app/overview`): số liệu hôm nay (Tiền đã thu, Doanh số đơn hoàn tất, TB/đơn, đơn tạo/hủy) và "Đang diễn ra" (bàn đang phục vụ, đơn mang đi, yêu cầu QR chờ duyệt, món chờ bếp), mỗi thẻ chỉ hiện khi có quyền. Là trang mặc định sau đăng nhập cho người có quyền xem doanh thu ngày.
- **Doanh thu ngày** (`/app/daily-revenue?date=`): chọn ngày, lùi/tiến từng ngày, cấu thành doanh số.
- **Báo cáo** (`/app/reports`): khoảng ngày (tối đa 366 ngày) + loại phục vụ + kênh tạo đơn trên URL; tab Tổng quan (KPI, biểu đồ theo ngày/tháng, phương thức thanh toán), Món bán chạy, Đối soát đơn (theo ngày tạo/hoàn tất/hủy/thu tiền).
- **Giá vốn & lãi tham chiếu** (`/app/reference-margin`): KPI phạm vi đủ giá vốn, cảnh báo độ phủ và lý do bị loại, biểu đồ, bảng đơn lọc theo độ phủ; giá vốn thiếu hiện "Chưa đủ", không bao giờ hiện 0.
- Tiền đã thu và Doanh số đơn hoàn tất luôn hiện riêng, kèm múi giờ và tiền tệ của báo cáo (theo report-fe-sync.md).

Phase 2 (đã xong):

- **Màn hình bếp** (`/app/kitchen`):
  - Phiếu theo đơn (vào trước làm trước, đổi màu khi chờ quá 10/20 phút) hoặc tổng hợp theo món.
  - Thao tác: Bắt đầu nấu / Đã xong / Đã giao từng món; "Xong cả đơn" (có xác nhận) và "Đã giao cả đơn".
  - Âm báo món mới, toàn màn hình, tự cập nhật qua realtime (hoặc 10 giây/lần khi không có realtime).
- **Đơn mang đi** (`/app/takeaway`): bảng đơn của Đơn hàng cố định loại mang đi (xác nhận, thu tiền, giao, hoàn tất, gọi thêm, yêu cầu QR mang đi); badge đếm đơn đang phục vụ.
- **Đơn hàng**:
  - Thu tiền chuyển khoản hiện mã VietQR theo đúng số tiền cần thu (phóng to cho khách quét, sao chép số tài khoản/nội dung, cảnh báo khi số tiền lệch).
  - Lỗi thiếu kho hiện từng món: làm được tối đa bao nhiêu, nguyên liệu còn/cần.
  - Nút "Nguyên liệu" ở từng dòng món: công thức đã chốt và hàng hóa đã giữ/tiêu thụ.
- **Gọi món**: POS web đã gộp chọn bàn (lưới bàn đang phục vụ), mang đi và chọn món trong một màn; hộp yêu cầu QR nằm ở Đơn hàng (badge). Không thêm màn chọn ngữ cảnh riêng như app để tránh thêm một bước bấm.

Phase 1 (đã xong):

- **Cài đặt**: hồ sơ nhà hàng, QR menu mang đi (tạo, đổi link, in thẻ), tài khoản nhận chuyển khoản (VietQR), gói dịch vụ, tài khoản của tôi.
- **Nhân viên**: danh sách lọc theo vai trò/trạng thái, thêm/sửa, khóa (có lý do)/mở khóa, phân quyền riêng (Theo vai trò / Cho phép / Chặn).
- **Thực đơn**: tab Món / Nhóm món / Nguyên liệu; ảnh món, còn/hết món, giá vốn tham chiếu "chưa cấu hình", cách trừ kho NONE/DIRECT/RECIPE.
- **Công thức** (`/app/menu/items/:id/recipes`): phiên bản, ước tính giá vốn, bật/tắt trừ kho theo công thức, lịch sử.
- **Sơ đồ bàn**: lưới bàn theo khu, khu vực, thêm/sửa/xóa bàn, mở/sửa/hủy phiên, chuyển bàn (idempotent), QR bàn (xem, tải, in thẻ, đổi mã), nút "Gọi món" mở POS đúng bàn.

Khác biệt có chủ ý so với app: app chặn vai trò CASHIER ở các màn quản lý chỉ vì thu ngân dùng web. Trên web, quyền xem/sửa đi theo permission × feature như backend; riêng Nhân viên giữ quy tắc OWNER/MANAGER của app.

Contract lấy từ `XayPOS_be/docs/openapi/*.yaml` và các tài liệu `XayPOS_be/docs/*-fe-sync.md`. Quy tắc quyền port 1-1 từ `pos_saas_app/lib/core/auth/access_policy.dart`.

## Checklist: thêm một module (hoặc chức năng app mới)

1. **Contract**: đọc OpenAPI và tài liệu `*-fe-sync.md` của backend. Không tự đoán field.
2. **Feature folder** `src/features/<module>/`, theo mẫu `features/order`:
   - `api/<module>Api.ts` gọi API theo pattern `tenantRequest(scope, signal)` → `api.*` → `ensureRequestScope` → `parseTenantResponse(schema, data, 'INVALID_<MODULE>_RESPONSE')`.
   - `api/<module>Keys.ts` đặt query key dưới `tenantKeys` (`['tenant', scope, '<module>', ...]`), dùng tên module riêng để event realtime của đơn hàng không invalidate nhầm.
   - `schemas.ts` (zod) và `types.ts` (`z.infer`). Tái dùng `pageSchema`, `versionSchema`, `moneySchema`, `quantitySchema`, `nonNegativeQuantitySchema`.
   - `policies/<module>AccessPolicy.ts`: port hàm `can*` tương ứng của app, dựng trên `shared/access/tenantAccess.ts`.
   - `utils/<module>Labels.ts` (nhãn tiếng Việt) và `utils/<module>Errors.ts`, gọi `registerTenantErrors({...})`.
   - `hooks/`, `components/`, `pages/<Module>Page.tsx`, `<module>.css`.
3. **Mutation**:
   - Gửi `expectedVersion` khi API yêu cầu.
   - Lỗi conflict (`isConflictError`) phải hiện nút "Tải lại".
   - Lệnh tạo có idempotency dùng `idempotencyHeaders(newIdempotencyKey())`, giữ nguyên key khi retry sau timeout.
4. **Đăng ký section** trong `src/portals/app/sections.tsx`:
   - đổi `status: 'planned'` sang `'ready'`;
   - khai báo `canSee`, `routes` (lazy bằng `lazyPage`) và, nếu cần, `useBadge`.
5. **UI**:
   - Dùng `src/shared/ui`: `PageTitle`, `Panel`, `DataTable`, `FilterBar` + `useUrlCriteria`, `Tabs`, `Drawer`, `ConfirmDialog`, các field form, `DateRangePicker`, `StatCard`/`KpiGrid`, `StatusBadge`, `Notice`, `ImageUpload`, `toast`.
   - Biểu đồ dùng `src/shared/charts/SeriesChart` (chỉ import từ page lazy).
6. **Realtime** (nếu có): khai báo event trong `shared/realtime/events.ts`, viết adapter trong `features/<module>/realtime/` và nối vào `portals/app/StaffRealtimeBoundary.tsx`.
7. **Test**: thêm `src/test/<module>*.test.ts(x)` cho API (path, params, body), policy (bảng permission × feature) và luồng UI chính, kể cả conflict, 403 và trạng thái rỗng.
8. **Tài liệu**: cập nhật bảng trạng thái ở trên.

## Quy ước giao diện

- Desktop là chính. Tablet (≥ 768px) dùng được đầy đủ. Điện thoại chỉ cần không vỡ layout. Bảng tự chuyển thành thẻ khi màn hình ≤ 900px.
- Danh sách giữ bộ lọc, sắp xếp và trang hiện tại trên URL, nên có thể chia sẻ link và giữ được khi tải lại.
- Form tạo/sửa mở trong `Drawer` bên phải. Thao tác không hoàn tác được phải qua `ConfirmDialog`; hủy hoặc xóa có ô lý do khi backend cần.
- Kết quả thao tác hiển thị bằng `toast`. Lỗi tải trang dùng `ErrorState` kèm nút "Thử lại".
- Màu và khoảng cách lấy từ `src/shared/styles/tokens.css` (`--pos-*`). Không dùng utility class của Tailwind; Tailwind chỉ để reset.
