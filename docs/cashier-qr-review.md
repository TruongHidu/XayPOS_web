# Xác nhận yêu cầu QR tại màn hình đơn cashier

Tại `/cashier/orders`, cột **Chờ xác nhận** có mục **Khách gọi qua QR**. Yêu cầu
PENDING nằm trong hàng đợi riêng, chưa phải order; sau khi xác nhận mới được tạo
hoặc thêm vào đơn và xuất hiện ở cột đang phục vụ. Bộ đếm chờ gồm yêu cầu QR và
đơn nháp, còn tổng đơn đang phục vụ chỉ tính order thật.

Hàng đợi đọc API staff `GET /qr-order-requests`, tự cập nhật mỗi 10 giây khi màn
hình đang mở, có phân trang riêng. Bộ lọc loại đơn ánh xạ TABLE/RESTAURANT; bộ lọc
phiên dùng `observedSessionId`. Tìm mã đơn chỉ áp dụng cho order vì API QR không hỗ
trợ tìm kiếm văn bản. Lịch sử order không trộn yêu cầu QR đã từ chối/hủy.

## Duyệt hoặc từ chối

- Nút **Xem và xác nhận** đọc `GET /qr-order-requests/{id}` và hiển thị món, ghi
  chú, khách, giá dự kiến, báo giá hiện tại, hạn yêu cầu và ngữ cảnh bàn.
- Duyệt bằng `POST /qr-order-requests/{id}/approve`: giữ đúng version và hash đang
  hiển thị, luôn gửi `targetSessionId`, kể cả khi null. Chỉ cho phép khi backend
  trả `canApprove`, yêu cầu chưa hết hạn và nhân viên đủ quyền. Phiên bàn đang có
  khách cần tích xác nhận đúng nhóm khách. Không gọi API mở phiên riêng.
- Từ chối bằng `POST /qr-order-requests/{id}/reject`, dùng version đã đọc và lý do
  không rỗng, tối đa 1.000 ký tự.
- Giá/phiên/version thay đổi hoặc mất kết nối: giữ thông báo, khóa quyết định và
  yêu cầu đọc lại. Không tự gửi lại POST. API chi tiết cho biết kết quả nếu một
  nhân viên khác đã xử lý hoặc phản hồi của lần gửi trước bị mất.
- Khi duyệt thành công, cập nhật cache chi tiết order và làm mới danh sách đơn,
  bàn, phiên, active order và hàng đợi QR. Khách xem kết quả bằng cơ chế polling
  public đã có.

## Quyền và cấu trúc

Đọc cần ORDER_VIEW cùng ORDER_MANAGEMENT; duyệt cần ORDER_CREATE + ORDER_UPDATE,
và TABLE_OPEN khi mở phiên bàn mới. Từ chối cần ORDER_UPDATE. API chi tiết vẫn
quyết định các điều kiện subscription, scope QR, giá và checkout ở backend.
QR mang đi không phụ thuộc POS_QUICK_ORDER của thao tác POS thủ công.

Mã mới nằm trong `src/features/qr-order-review`: schemas/types, API, hooks,
policies, components, CSS. Dùng private HTTP client với Bearer và tenant scope;
không dùng guest token/client public. Query keys thuộc `['cashier', scope]` nên
được hủy/xóa cùng cache cashier khi đổi phiên hoặc nhà hàng.

Hợp đồng được đối chiếu với QrStaffRequestController, QrStaffRequestSummary,
QrStaffRequestDetail, QrApprovalResponse và QrStaffRequests trong backend hiện tại.
Không thay đổi dữ liệu nhà hàng hoặc subscription khi kiểm thử frontend.

Kiểm thử chính: `src/test/qrReviewApi.test.ts` và `src/test/qrReviewUi.test.tsx`.

Kết quả ngày 15/10/2026: bộ hồi quy 280 test đạt; sau khi bổ sung chặn quyết định
khi đọc lại báo giá thất bại, chạy riêng đủ 15 test QR và đều đạt. Build production,
TypeScript và ESLint các file mới/sửa đạt. Build còn cảnh báo bundle lớn và auth
dynamic/static import đã có. Các test dùng MSW, chưa thực hiện quyết định trên
yêu cầu thật của nhà hàng.
