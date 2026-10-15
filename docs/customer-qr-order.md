# Khách gọi món qua QR — triển khai frontend

Giao diện khách đã hỗ trợ menu, giỏ local, gửi yêu cầu chờ nhân viên duyệt và theo
dõi kết quả cho cả QR bàn và menu mang đi. Mở rộng menu hiện có tại `features/qr-menu`;
nghiệp vụ mới tách trong `features/qr-order`. Không thêm dependency.

## Routes

| Route                                  | Nghiệp vụ                   |
| -------------------------------------- | --------------------------- |
| `/qr/:qrToken`                         | Menu và gọi món tại bàn     |
| `/menu/:menuToken`                     | Menu và yêu cầu mang đi     |
| `/qr/:qrToken/requests/:requestId`     | Receipt của yêu cầu tại bàn |
| `/menu/:menuToken/requests/:requestId` | Receipt của yêu cầu mang đi |

Các route nằm ngoài AuthBootstrap và private guards. Public Axios client không
Bearer token/cookie/refresh logic; QueryClient riêng không bị clear khi nhân viên
logout. QR/menu token phân biệt hoa thường và namespace; guest token chỉ nằm trong
memory, không xuất hiện trong URL hoặc query keys mới.

## Nghiệp vụ và cấu trúc

- `api/publicQrOrderApi.ts`: POST guest-access với `{}`, POST requests và GET receipt;
  encode path, allowlist body/header, schema validation và replay header.
- `schemas.ts`, `types.ts`, `policies/qrOrderPolicy.ts`: giới hạn input, DTO nullable,
  mapping entry/service/source, trạng thái receipt và polling.
- `store/qrOrderGuestStore.ts`: guest access single-flight, scope/epoch, requestId đã
  biết, invalid/cooldown, AbortController. Đổi entry A → B → A là scope mới.
- `store/qrOrderDraftStore.ts`: giỏ local và frozen intent. Không nhân bản receipt
  vào Zustand hoặc dùng state/client của Cashier.
- `hooks`: orchestration gửi/navigate, guest lifetime, query receipt, polling/backoff
  và cảnh báo rời trang khi còn giỏ/yêu cầu chưa rõ kết quả.
- `components`: giỏ, form khách/RHF, sửa quantity/note, history trong lượt truy cập,
  feedback và receipt. Page trong portal ghép các component/hook; không gọi Axios.

Menu chỉ GET, không cấp guest hoặc mở phiên. OUT_OF_STOCK vẫn hiển thị, khóa chọn.
Mang đi không dựng bàn giả; tên nhận hàng bắt buộc, phone tùy chọn. Giỏ tối đa 20
dòng; quantity 0,001–20, tối đa 3 thập phân; ghi chú chung/dòng 500 ký tự; tên 100,
phone 30. Tiền preview dùng scaledDecimal/BigInt, số chính thức lấy response.

Gửi yêu cầu lần đầu mới cấp guest access. Một intent freeze guest/key/body đã
chuẩn hóa. Double click bị khóa; timeout/network/5xx/malformed response giữ nguyên
intent để kiểm tra lại. 429 giữ key/body và tôn trọng Retry-After. Token invalid
không mint lại hoặc staff-refresh tự động; intent chưa rõ phải đối chiếu với nhà hàng.

POST mới 201 hoặc replay 200 dùng status server thực tế. PENDING chỉ chờ duyệt,
chưa có order/bill/phiên mới. APPROVED có giá chốt/mã đơn/trạng thái các món thuộc
request; không đọc toàn bộ bill hoặc API order private. expired chỉ đổi nhãn hết
hạn khi status còn PENDING. Giá dự kiến không bị ghi đè bằng menu mới.

Receipt polling 5–10 giây có backoff và jitter ổn định theo scope/request. Tab
background/offline, guest invalid/cooldown hoặc receipt terminal dừng polling.
APPROVED vẫn theo dõi món đến SERVED/CANCELLED; cùng request.version vẫn nhận
status món mới. Jitter không được sinh lại mỗi lần countdown rerender để tránh
reset interval liên tục. Success POST được giữ trong cache trước khi navigate,
và GET lỗi không xóa receipt đã biết.

Gọi thêm tại bàn gửi request mới/key mới, vẫn chờ staff duyệt; không tự append vào
order private. Mỗi request mang đi được duyệt là một đơn độc lập. Giao diện khách
không có approve/reject/sửa/hủy request đã gửi/thu tiền hoặc thao tác bếp.

## Kiểm tra và ảnh giao diện

Test fixtures/MSW chỉ nằm trong `src/test`. Browser QA dùng Chrome headless với
API intercept, chặn endpoint ngoài public contract, không ghi dữ liệu nhà hàng thật:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 3011 --strictPort
node src/test/qrOrder.browser.mjs
```

Helper dùng Chrome cài sẵn; có thể đặt CHROME_BINARY khi cần. Profile Chrome riêng
nằm trong temp, được kiểm tra path và dọn sau chạy. Ảnh kiểm tra dùng dữ liệu giả:

- [Desktop menu](qa/qr-order/desktop-menu.png).
- [Mobile menu](qa/qr-order/mobile-menu.png).
- [Mobile giỏ](qa/qr-order/mobile-cart.png).
- [Mobile receipt đã duyệt](qa/qr-order/mobile-receipt.png).
- [Desktop receipt mang đi](qa/qr-order/desktop-takeaway-receipt.png).

Helper kiểm desktop 1366px/mobile 390px, không tràn ngang, không gọi auth/private
API, hai guest mint/hai intent cho hai entry; kiểm tự cập nhật APPROVED qua polling.
API/store/UI tests mới ở qrOrderApi, qrOrderStore và qrOrderUi; giữ hồi quy menu cũ.

Kết quả xác minh trên mã cuối ngày 14/10/2026:

- Toàn bộ 266/266 test đạt, gồm 41 test QR-order mới và các test hồi quy.
- `npm.cmd run build` đạt TypeScript và Vite; còn warning bundle >500KB và dynamic/
  static auth import.
- ESLint phần QR/API/UI/test được thêm hoặc sửa đạt, không warning mới.
- Oxlint exit 0, chỉ warning unused `itemsCalls` trong test QR menu sẵn có.
- ESLint toàn repository còn 3 lỗi ngoài phần mới: hai explicit-any trong
  `orderBulkAndCompletion.test.tsx` và unused `itemsCalls` trong `qrMenu.test.tsx`.
- Chrome headless đạt hai entry, desktop/mobile và polling tự cập nhật APPROVED;
  ảnh ở các liên kết trên dùng fixture/API intercept. Chưa E2E backend thật.

## Giới hạn và phụ thuộc

- Memory-only: reload hoặc rời public portal mất guest access và quyền đọc receipt
  cũ; guest mới không được dùng để khôi phục yêu cầu của identity cũ. UI giải thích
  và hướng dẫn liên hệ nhân viên. Không auto-submit sau reload/remount.
- Link ra khỏi entry và beforeunload có cảnh báo giỏ/intent chưa rõ. Browser back/
  forward giữa entry khác nhau reset scope để bảo vệ dữ liệu; không thay BrowserRouter
  bằng data router để bổ sung blocker ngoài phạm vi.
- Nhà hàng cần effective subscription snapshot có QR_MENU_VIEW và QR_TABLE_ORDER
  (+ ORDER_MANAGEMENT/TABLE_MANAGEMENT) hoặc QR_STATIC_ORDER (+ ORDER_MANAGEMENT).
  Basic/Pro không tự chứng minh quyền; không gọi entitlement API nhân viên từ QR.
- Nhân viên phải review/approve bằng luồng staff thì request mới vào đơn. Inbox QR
  nhân viên không triển khai trong lần này. Chưa E2E với backend/nhà hàng thật;
  browser approval là response giả phục vụ QA giao diện.
- Không public payment, guest edit/cancel, WebSocket, Service Worker/offline queue,
  in hóa đơn hoặc persist credentials/PII.
