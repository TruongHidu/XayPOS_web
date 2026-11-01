# In bill Cashier: tạm tính, đã thanh toán, in lại và giấy 80 mm

Chức năng dùng HTML/CSS và hộp thoại in của trình duyệt, tái sử dụng REST ORDER/PAYMENT hiện có. Không thêm endpoint/dependency, không sửa backend hoặc Flutter. Không có hóa đơn điện tử, silent printing, ESC/POS, gateway, in bếp hoặc server print job.

## Cách sử dụng

- Mở chi tiết đơn tại trang order hoặc modal từ danh sách/kanban. Đơn chưa thanh toán có **In tạm tính**; đơn PAID hợp lệ, kể cả COMPLETED, có **In lại bill**.
- Sau ghi nhận thanh toán SUCCESS hợp lệ, bấm **In bill / Phiếu thu**. Nếu GET order thất bại hoặc chưa khớp trạng thái thanh toán, kết quả payment vẫn được giữ và nút **Tải lại đơn để in** chỉ đọc REST, không thu tiền lần nữa.
- Bấm nút in một lần: ứng dụng đọc và xác minh snapshot REST rồi mở lệnh in ngay, không yêu cầu xem trước/bấm In lần hai. Khi đang đọc dữ liệu, có thể **Đóng**/Escape để hủy chuẩn bị. Sau kết thúc hộp thoại hệ thống, vùng in và trạng thái chuẩn bị tự đóng; giỏ và payment intent được giữ.
- Nếu version/loại bill khác với đơn vừa xem, hoặc có realtime update trong lúc đọc, ứng dụng dừng để **Kiểm tra bill**. Dùng **Tải lại bill** nếu dữ liệu còn stale; kiểm tra số tiền/nội dung rồi **Xác nhận và in**. Đây là bước xử lý thay đổi dữ liệu, không phải preview bắt buộc của luồng bình thường.
- Nếu đọc dữ liệu hoặc mở hộp thoại in lỗi, báo lỗi và cho **Tải lại bill**; không tự thử in/thu tiền lại. Trình duyệt thông thường vẫn có hộp thoại chọn máy in hoặc Save as PDF. Máy quầy có thể cấu hình Chrome `--kiosk-printing` riêng để tự xác nhận bước in của trình duyệt; web không tự bật cấu hình này.
- Sau đóng modal/reload, mở đơn lịch sử và bấm In lại bill. Bản này có **BẢN IN LẠI**, thời điểm in lại và mã/thời gian thanh toán gốc nếu đủ quyền đọc payment.

Không tự in khi render/useEffect thanh toán, replay, StrictMode hoặc nhận socket event. Một lần bấm In chỉ mở một phiên in; Cancel hộp thoại không được coi là payment fail hoặc giấy đã in thành công.

## Dữ liệu và quyền

Bill tạm tính dùng Order đã lưu, không lấy giỏ chưa gửi. Chỉ UNPAID/paidAmount=0 và status OPEN/CONFIRMED/PREPARING/READY/SERVED được hỗ trợ. Đơn CANCELLED không được in thành bill phải thu; partial/refund nằm ngoài contract MVP và bị chặn rõ ràng.

Bill đã thanh toán cần Order PAID, totalAmount > 0, paidAmount khớp tổng theo helper tiền chính xác và order còn phục vụ hoặc COMPLETED. Nếu có Payment, payment phải SUCCESS, cùng orderId/currency, đúng toàn bộ amount và có paidAt hợp lệ. Presence của một object/HTTP 2xx/socket event không thay cho các kiểm tra này. Response PENDING/FAILED/CANCELLED hoặc sai định danh/tiền tệ/số tiền không đi vào giao diện success; giữ intent gốc cho bước kiểm tra thủ công.

Quyền được tách khỏi ghi tiền:

| Luồng                        | Quyền/nguồn                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Đọc order để in              | ORDER_VIEW + ORDER_MANAGEMENT và guard tenant/subscription hiện có                                                          |
| GET lịch sử/chi tiết payment | canViewPayment: PAYMENT_VIEW + PAYMENT_MANAGEMENT                                                                           |
| In ngay sau ghi nhận payment | Có thể dùng response SUCCESS đã được cấp hợp lệ của chính lần ghi nhận, không đòi thêm PAYMENT_VIEW chỉ để dùng response đó |
| In lại chỉ với ORDER_VIEW    | In tổng PAID đã xác minh từ Order, không GET/hiện chi tiết payment trái quyền                                               |

In lại không cần PAYMENT_CREATE/PAYMENT_CONFIRM. Không bypass bằng OWNER hoặc tên package. Payment list được đọc qua các trang (size 100, tối đa 50 trang) và kiểm đúng một SUCCESS phù hợp, không chọn content[0]. Không có, nhiều SUCCESS, paging không nhất quán hoặc payment mâu thuẫn đều chặn bill chi tiết để tải lại/kiểm tra; không fallback đoán phương thức, mã hoặc thời điểm.

Tên/giá/số lượng/lineTotal là snapshot ORDER, không đọc menu để reprice. Giữ từng orderItemId dù cùng itemId; bỏ dòng CANCELLED. Không dùng marker gọi thêm chỉ có trong memory. Template chỉ nhận allowlist, không in cost/configuration/recipe/reservation/token/private debug. Thiếu tên bàn, địa chỉ, logo, điện thoại hoặc người thu tiền thì không bịa thông tin; tên người đang đăng nhập không được mặc định là người đã thu tiền. Tên/mã nhà hàng lấy từ auth đã được xác thực.

## Tiền khách đưa và giới hạn in lại

Backend hiện không lưu cashGiven/change. Hai dòng này chỉ in cho CASH khi có input đã chốt cùng payment/order/amount của lần thu tiền hiện tại. Sau reload/in lại, hai dòng được bỏ; không suy khách đưa bằng tổng tiền hoặc tiền thừa bằng 0. Không thêm storage để lưu bill/PII hoặc lịch sử số lần in.

Backend chưa có immutable bill snapshot, số bill riêng hoặc audit số lần in. In lại dựng từ Order/Payment REST hiện có và thông tin nhà hàng hiện hành; không cam kết giống từng pixel/thông tin cửa hàng của lần in đầu. Định danh dùng orderCode/paymentCode hiện có. Đây là bill bán hàng/phiếu thu trong sản phẩm, không phát hành hóa đơn điện tử.

## Kiến trúc và lifecycle

- `printing/receiptModel.ts`: policy loại bill, kiểm PAID/SUCCESS/tender và model allowlist frozen.
- `components/ReceiptPrint.tsx`: một template chung cho preview và print, không tự gọi HTTP/auth.
- `printing/loadReceipt.ts`: REST qua ordersApi/paymentsApi, scope/generation/AbortSignal, cacheOrderSnapshot version guard và paging payment.
- `printing/ReceiptPrintingProvider.tsx`: mount trong nhánh `/cashier`, bên trong StaffRealtimeBoundary; giữ một print intent, tự mở in khi REST hợp lệ và root `#staff-receipt-print-root` portal vào body. Chỉ hiện bản bill để kiểm tra khi version/loại bill thay đổi hoặc realtime báo stale.
- `printing/browserPrint.ts`: một native print session/tab, chờ render/font có giới hạn, kiểm root/scope, quản lý afterprint/print-media/focus/pagehide/dispose.
- `printing/ReceiptButton.tsx`: nút chung tại OrderPanel/OrderDetailModal, chỉ dùng prop order để chọn nhãn; dữ liệu in thực tế được đọc lại qua REST.
- `payment/utils/paymentConfirmation.ts`: kiểm response dựa vào payment intent đã freeze trước khi hiển thị success.

Không in từ giỏ hoặc order summary thiếu items. Query cache vẫn quản lý snapshot server; print state chỉ giữ một tài liệu đã chuẩn bị. Nút in truyền expectedVersion/expectedKind của đơn vừa xem. Realtime/query mới hoặc version khác buộc kiểm tra lại trước khi in; khi bắt đầu phiên in, tài liệu và printedAt được chốt, không đổi khi dialog hệ thống đang mở.

Logout/đổi tài khoản, kể cả cùng user đăng nhập lại, dùng sessionRevision + orderScope để chặn response/callback cũ. Đóng chuẩn bị/kiểm tra bill hoặc unmount abort GET và dọn root/listeners/timers. Không gọi verifyOrder/unlockOrder/clearAppend từ print, không clear app cache hoặc đổi draft/uncertain/refusal/idempotency. In, tải lại bill và in lại không POST/PATCH/DELETE payment/order/complete/close session.

Native print không báo máy in đã nhả giấy: afterprint có thể là Cancel hoặc lưu PDF. UI không hiện “đã in thành công”. Fallback cho browser không phát afterprint chỉ cleanup khi print media không active, tab visible/focused và print đã trả về; có dispose khi rời scope/page. Không bỏ root quá sớm theo một timeout cố định lúc hộp thoại còn mở.

Public QR/admin không mount provider, không staff auth/payment GET do in và không thêm socket/subscription. Print CSS chỉ hoạt động khi body có data-staff-receipt-print; Ctrl+P ngoài phiên bill không làm toàn app biến mất. CSS visibility:hidden cũ đã được gỡ.

## Máy in và bố cục 80 mm

Mẫu dùng root rộng **80 mm**, padding ngang **4 mm** mỗi bên, vùng nội dung **72 mm**. Chiều dài theo nội dung; không cố định height hoặc dùng max-width px để giả khổ giấy. Tên món/ghi chú trên dòng riêng, số lượng/đơn giá/thành tiền canh phải; có xử lý số lượng lẻ, giá lớn và font hỗ trợ tiếng Việt. CSS page-break tránh tách một nhóm món hoặc phần tổng/thanh toán khi driver phân trang.

Thiết lập trong trình duyệt/driver:

1. Chọn đúng máy in và khổ roll **80 mm** hoặc cấu hình khổ tương ứng của driver. CSS named page dùng size:auto, không ép một chiều dài giấy cố định.
2. Scale 100%/Actual size; tắt headers/footers của trình duyệt, đặt margin None/0 nếu driver cho phép.
3. Kiểm tra print preview: không co nhỏ theo A4, không mất dấu tiếng Việt/tổng tiền, không tràn ngang. Nếu vùng in máy thực tế nhỏ hơn 72 mm, cần hiệu chỉnh CSS/driver phù hợp thiết bị.
4. Có thể Save as PDF để kiểm nội dung trước. Lưu PDF không đồng nghĩa đã kiểm thử máy in vật lý hoặc thao tác cắt giấy.

Không tự chọn máy in, silent print hoặc điều khiển dao cắt qua browser API này. Cấu hình giấy/scale/margin của driver vẫn là bước triển khai tại quầy.

## Kiểm thử và ảnh QA

Unit/component: Vitest/RTL/MSW, fake window.print và lifecycle, không backend thật. Bao phủ model/tender/legacy dữ liệu thiếu, callback/scope/StrictMode, payment mismatch và GET fail recovery, paging, read-only staff, reprint sau remount, realtime dirty, frozen root, giữ draft/uncertain/key và không mutation từ in.

Browser QA dùng native CDP script sẵn convention, không dependency mới:

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 3011 --strictPort
node src/test/billPrint.browser.mjs
```

Script chặn toàn bộ REST bằng fixture; navigator offline có chủ ý để không tạo staff socket thật. Vì vậy report socket=0 không phải kết luận về một socket/tab khi online. window.print được spy để kiểm vùng DOM và print media, không mở hộp thoại máy in thật.

Đã kiểm 4 mẫu ngắn/dài tạm tính và COMPLETED paid in lại bằng Chrome **156.0.8078.48** trên Windows. Mỗi mẫu một lần bấm/một print target/call, không có preview ứng dụng; tự đóng trạng thái in sau afterprint. Root đo khoảng 302.359 px (80 mm), nội dung 272.125 px (72 mm), không tràn ngang. Có case 24 dòng tên/ghi chú dài, số lượng lẻ, giá lớn, discount/tax/service fee, SUCCESS payment ở trang 2. Business mutation từ luồng in bằng 0.

Ảnh và kết quả:

- [Bill tạm tính ngắn](qa/bill-printing/short-provisional-80mm.png).
- [Bill tạm tính dài](qa/bill-printing/long-provisional-80mm.png).
- [Bill đã thanh toán in lại](qa/bill-printing/short-paid-reprint-80mm.png).
- [Bill đã thanh toán dài in lại](qa/bill-printing/long-paid-reprint-80mm.png).
- Ảnh giao diện sau khi in (`*-after-print.png`) và [browser report](qa/bill-printing/browser-report.json) cùng thư mục. Các ảnh `*-preview.png` được giữ từ lần QA trước khi bỏ bước preview bắt buộc.

Chưa thử máy in vật lý, driver/máy cắt giấy, browser khác hoặc native print dialog; không xuất PDF trong QA này. Cần thử tại quầy trước khi sử dụng chính thức.

### Kết quả kiểm tra khi bàn giao

| Kiểm tra                          | Kết quả                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd test -- --maxWorkers=1`  | 35 file, **509/509 test đạt**, gồm 62 test về model/in/thanh toán/lifecycle                                                                                                      |
| `npm.cmd run build`               | Đạt; bao gồm `tsc -b` và Vite production build                                                                                                                                   |
| `npm.cmd run lint`                | Đạt; còn warning unused `itemsCalls` có sẵn trong `src/test/qrMenu.test.tsx:324`                                                                                                 |
| `npm.cmd run lint:eslint`         | Còn 3 lỗi có sẵn: hai `any` tại `src/test/orderBulkAndCompletion.test.tsx:416,427` và unused `itemsCalls` tại `src/test/qrMenu.test.tsx:324`; hai file này không đổi so với HEAD |
| ESLint các file JS/TS đã sửa/thêm | Đạt                                                                                                                                                                              |
| `git diff --check`                | Đạt                                                                                                                                                                              |
| Browser QA                        | 4/4 mẫu in một lần bấm đạt; 4 ảnh print media, 4 ảnh sau khi in và JSON report trong `docs/qa/bill-printing`                                                                     |

Một lượt regression chạy song song có lỗi timing ở case QR guest hết hạn (`src/test/qrOrderReload.test.tsx:209`). File test và code QR không thay đổi so với HEAD. Chạy lại riêng file này đạt 7/7; chạy toàn bộ tuần tự đạt 509/509 như trên. Không sửa test cũ để bỏ qua lỗi. Build vẫn có cảnh báo chunk lớn hơn 500 kB và authStore vừa được import tĩnh vừa được import động.

### File thêm/sửa

- Tích hợp: `src/App.tsx`, `src/features/order/components/OrderPanel.tsx`, `OrderDetailModal.tsx`, `ReceiptPrint.tsx`, `src/features/order/order.css`.
- Chuẩn bị và in (thêm): `src/features/order/printing/receiptModel.ts`, `loadReceipt.ts`, `ReceiptPrintingContext.ts`, `ReceiptPrintingProvider.tsx`, `ReceiptButton.tsx`, `browserPrint.ts`, `receipt.css`, `receiptPreview.css`.
- An toàn thanh toán: sửa `src/features/payment/components/PaymentModal.tsx`, `src/features/order/utils/orderErrors.ts`; thêm `src/features/payment/utils/paymentConfirmation.ts`.
- Test mới: `src/test/receiptModel.test.tsx`, `browserPrint.test.ts`, `paymentPrintSafety.test.tsx`, `receiptWorkflow.test.tsx`, `billPrint.browser.mjs`.
- Tài liệu/QA: `docs/bill-printing.md`, link trong `README.md`, ảnh và `docs/qa/bill-printing/browser-report.json`.

File `docs/bill-printing-implementation-prompt.md` đã có trong workspace trước lượt triển khai này và được giữ nguyên. Không thay đổi package/dependency/backend/Flutter hoặc tạo commit.

## Manual tại quầy

1. Đơn tại bàn/mang đi chưa trả tiền: In tạm tính, xem tên/giá/số lượng/tổng đúng; không tạo payment/confirm/complete.
2. Thu CASH có tiền khách đưa và TRANSFER có mã tham chiếu: chỉ sau response SUCCESS đúng và Order PAID mới cho bill đã thanh toán. Chưa served vẫn in được; input trước đó giữ nguyên khi lỗi/refetch.
3. GET order lỗi sau SUCCESS: chỉ tải lại đơn để in, không có nút thu lại hoặc POST mới. Timeout POST: đối soát bằng cùng key/body/version gốc.
4. Đóng modal, reload, mở đơn COMPLETED và In lại: đúng marker/mã/paidAt; không tự dựng tiền khách đưa/tiền thừa.
5. FAILED/PENDING/mismatch payment hoặc CANCELLED/refund/partial order không được gắn nhãn đã trả đủ. User thiếu PAYMENT_VIEW chỉ in tổng Order PAID, không payment GET trái quyền.
6. Bill dài, món cùng itemId nhưng khác dòng/giá, món hủy, tiếng Việt/ghi chú dài, số lượng lẻ và số tiền lớn không tràn/cắt.
7. Nhận cập nhật thiết bị khác trong lúc chuẩn bị: dừng in, tải lại rồi kiểm tra bill và xác nhận. Dữ liệu không đổi giữa dialog in. Double click chỉ một lệnh in; Cancel dialog tự dọn trạng thái, đóng chuẩn bị/logout/đổi tenant khi GET chưa xong không in bản cũ. Lỗi tải dữ liệu hoặc mở in có thể thử lại bằng GET.
8. Kiểm giỏ/menu/payment intent/filter/modal đang thao tác không bị reset; auth/realtime/public QR/admin không bị ảnh hưởng.
