# Cashier Order — đồng bộ API ngày 13/10/2026

Frontend React/TypeScript dùng API nhân viên của `pos-saas-be`. Backend đã có
SUBMIT từ bàn, một order đang phục vụ mỗi phiên, thanh toán thủ công và lifecycle bếp.
Tài liệu này thay thế mô tả MVP cũ tạo DRAFT/mở phiên trước/gọi thêm bằng đơn mới.

Prompt triển khai bố cục theo ảnh: [pos-ui-implementation-prompt.md](pos-ui-implementation-prompt.md).
Prompt là yêu cầu cho lần triển khai giao diện tiếp theo; bố cục Kanban và giao diện
POS hai vùng theo ảnh chưa được dựng trong lần đồng bộ API này.
Phạm vi prompt đã được điều chỉnh theo yêu cầu: web Cashier chỉ gọi món và thanh
toán; trạng thái phục vụ chỉ đọc, không triển khai KDS/complete/close UI.

## Routes và service context

- `/cashier/pos?serviceType=TAKEAWAY`: giỏ mang đi, không query bàn/phiên.
- `/cashier/pos?serviceType=DINE_IN`: chọn bàn.
- `/cashier/pos?serviceType=DINE_IN&tableId=<uuid>`: bàn trống, giỏ local.
- `/cashier/pos?tableSessionId=<uuid>`: xác minh phiên OPEN và bàn hiện tại.
- `/cashier/orders`: danh sách theo URL; `tableSessionId` lọc cả lịch sử phiên.
- `/cashier/orders/:orderId`: snapshot, sửa nháp, hủy và gọi thêm theo quyền.

AVAILABLE/INACTIVE là trạng thái cấu hình. `occupied/currentSession` dùng cho trạng
thái sử dụng; `canOpen` dùng cho bàn trống có thể chọn. Chọn bàn không POST mở phiên.
Mở phiên thủ công vẫn có adapter riêng, nhưng không dùng trong luồng POS mặc định.

Bàn có khách: GET current-session, GET active-order. 200 mở đúng orderId; 204 mới
cho tạo trong phiên. Lỗi không được coi là chưa có order. Lịch sử có nhiều order,
nhưng chỉ một order OPEN/CONFIRMED/PREPARING/READY/SERVED đang phục vụ mỗi phiên.

## Gửi đơn và gọi thêm

Nút “Gửi đơn” dùng POST `/orders`, `submissionMode=SUBMIT`, source `CASHIER` trong
portal hiện tại. Schema cũng nhận source `WAITER`. Thành công trả CONFIRMED và
tableSessionId/version authoritative; không POST confirm lần hai.

TAKEAWAY không gửi bàn/phiên. DINE_IN gửi đúng một tableId hoặc tableSessionId.
tableId chỉ hợp lệ với SUBMIT; backend mở phiên khi gửi trong cùng transaction.
Đơn nháp legacy vẫn được adapter hỗ trợ cho TAKEAWAY hoặc phiên đã mở, với mode
DRAFT hoặc bỏ mode; thông tin/món cũ chỉ được sửa khi OPEN và chưa thanh toán.

Gọi thêm dùng POST `/orders/{orderId}/items` với expectedVersion, SUBMIT, items mới
và Idempotency-Key. canAppend tách khỏi editable: OPEN/CONFIRMED/PREPARING/READY/SERVED,
UNPAID và paidAmount=0; sau PAID không gọi thêm. Dòng mới giữ snapshot riêng, không
thay giá/tên/trạng thái món cũ. READY/SERVED có thể trở lại PREPARING sau gọi thêm.

Giỏ tạo mới freeze body/key trước gửi. Frozen append lưu trong orderOperationState,
giữ qua đóng/mở modal. Timeout/network/5xx/response malformed giữ đúng target,
expectedVersion/body/key; nút kiểm tra gửi lại yêu cầu gốc, không đổi version theo GET.
GET lại đơn không tự xóa uncertain nếu vẫn còn frozen append. Thành công/replay
mới xóa intent và cập nhật server state. Key xung đột không được thay bằng key mới.

## Adapter lifecycle đã bổ sung

| Adapter                                       | API                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `ordersApi.active`                            | GET `/table-sessions/{id}/active-order`, 200/204                       |
| `ordersApi.startCooking/markReady/markServed` | POST item transition, expectedOrderVersion                             |
| `ordersApi.complete`                          | POST `/orders/{id}/complete`, expectedVersion order                    |
| `paymentsApi.record`                          | POST `/orders/{id}/payments`, key, expectedOrderVersion, CASH/TRANSFER |
| `paymentsApi.list/detail`                     | GET payment page/detail                                                |
| `kitchenApi.items`                            | GET `/kitchen/items`, PENDING/COOKING/READY                            |
| `cashierTablesApi.close`                      | POST `/table-sessions/{id}/close`, expectedVersion session             |

Các adapter mới đã có schema validation và tenant scope, chưa có modal thu tiền,
trang KDS hay nút complete/close trong UI. Prompt chỉ yêu cầu kết nối gọi món và
modal thu tiền; adapter KDS/complete/close nằm ngoài phạm vi giao diện Cashier.
`paymentsApi.record` không tự GET/rebuild body: caller phải đọc order mới nhất khi
tạo intent và freeze nó; replay luôn dùng body/key gốc. PaymentResponse không có
order.version mới, nên caller cần GET order sau thành công.

Thanh toán amount chính xác bằng totalAmount, TRANSFER cần mã giao dịch nhân viên
đã đối soát. PAID không tự SERVED/COMPLETED/CLOSED. Complete cần PAID đủ tiền,
totalAmount>0 và mọi món chưa hủy SERVED; close dùng session.version riêng.
Không thêm thanh toán tự động/QR ngân hàng/webhook hoặc hóa đơn điện tử.

## Quyền và feature

Mọi check dùng effective permissions/features/subscription ACTIVE, không OWNER bypass.

| Action            | Permission + feature                                               |
| ----------------- | ------------------------------------------------------------------ |
| Đọc đơn           | ORDER_VIEW + ORDER_MANAGEMENT                                      |
| SUBMIT mới        | ORDER_CREATE + ORDER_UPDATE + ORDER_MANAGEMENT + feature theo loại |
| SUBMIT TAKEAWAY   | thêm POS_QUICK_ORDER                                               |
| SUBMIT DINE_IN    | thêm TABLE_MANAGEMENT; mở phiên mới thêm TABLE_OPEN                |
| Gọi thêm SUBMIT   | ORDER_UPDATE + ORDER_MANAGEMENT + feature theo loại                |
| Menu              | MENU_VIEW + MENU_MANAGEMENT                                        |
| Bàn/khu vực/phiên | TABLE_VIEW + TABLE_MANAGEMENT                                      |
| Sửa OPEN/confirm  | ORDER_UPDATE + ORDER_MANAGEMENT                                    |
| Hủy dòng          | ORDER_UPDATE trước confirm, ORDER_CANCEL sau confirm               |
| Hủy root          | ORDER_CANCEL + ORDER_MANAGEMENT; giữ guard món/tiền                |
| Thu tiền          | PAYMENT_CREATE + PAYMENT_CONFIRM + PAYMENT_MANAGEMENT              |
| Xem payment       | PAYMENT_VIEW + PAYMENT_MANAGEMENT                                  |
| Queue/nấu/ready   | permission KITCHEN tương ứng + KITCHEN_DISPLAY                     |
| Giao/hoàn tất     | ORDER_MARK_SERVED/ORDER_COMPLETE + ORDER_MANAGEMENT                |
| Đóng bàn          | TABLE_CLOSE + TABLE_MANAGEMENT; cần đọc phiên trước để lấy version |

## Cache, lỗi và bảo toàn dữ liệu

Base URL đã gồm `/api/v1`. HTTP client dùng Bearer token, Accept JSON; Axios đặt
Content-Type cho JSON body. Tenant từ JWT, không gửi restaurantId/createdBy/giá/status.
Các adapter order/menu/table/payment/kitchen kiểm tenant scope và request epoch.

Query keys gồm scope, target và criteria. Tạo đơn invalidate lists/tables/sessions;
gọi thêm invalidate lists/active-order/kitchen. Response server thay snapshot detail.
Giữ version baseline khi form mở; GET cũ không được đè response mutation mới.

409 version: giữ giỏ/form, invalidate detail để đối chiếu, không blind retry hoặc
tạo đơn khác. TABLE_SESSION_HAS_SERVING_ORDER giữ giỏ và yêu cầu kiểm tra order.
403 khóa thao tác; không refresh-loop. Logout/switch tenant/access boundary xóa
giỏ/intent/cache và bỏ response trễ. Refresh entitlement tạm giữ state cùng scope.

Tiền/quantity dùng scaledDecimal BigInt, HALF_UP preview từng dòng. Snapshot tiền
lấy backend; dòng hủy giữ snapshot nhưng không cộng ngược vào tổng root.

## Kiểm thử và giới hạn

Tests: `orderApi`, `orderStore`, `orderUi`, `cashierWorkflowApi` và hồi quy auth/admin/QR.
MSW chỉ dùng trong test; không tạo dữ liệu nhà hàng thật. Lệnh Windows dùng npm.cmd
để tương thích PowerShell execution policy:

```powershell
npm.cmd test -- --reporter=dot --maxWorkers=2
npm.cmd run lint
npm.cmd run lint:eslint
npm.cmd run build
```

Giỏ/intent hiện chỉ memory, chưa khôi phục sau reload/process kill. Chưa E2E với
backend chạy thật. Chưa triển khai lại toàn bộ bố cục theo ảnh, modal thanh toán,
KDS, complete/close UI. Bước triển khai giao diện theo prompt chỉ kết nối gọi món
và thanh toán; không bổ sung thao tác bếp, giao món, complete hoặc close.

Baseline đã được ghi nhận trước lần đồng bộ: TypeScript/ESLint báo unused trong
`usePublicQrMenuContext.ts`, `usePublicQrMenuItems.ts` và `qrMenu.test.tsx`. Khi báo
kiểm tra, tách các lỗi này khỏi lỗi mới của phần cashier; không ghi build thành công
nếu vẫn bị baseline chặn.

Kết quả kiểm tra lần đồng bộ: toàn bộ 202/202 test đạt; oxlint exit 0 (5 warning QR
có sẵn); ESLint các file cashier/API/test được sửa đạt. Build vẫn bị 4 lỗi TS6133
unused trong phần QR nêu trên chặn. Chưa kiểm thử backend thật hoặc kiểm tra hình
ảnh giao diện mới, vì lần này chỉ xuất prompt thiết kế và đồng bộ API/luồng hiện tại.
