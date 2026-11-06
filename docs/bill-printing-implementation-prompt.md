# Prompt triển khai in bill Cashier — tạm tính, đã thanh toán, in lại, giấy 80 mm

Hãy triển khai chức năng in bill cho dự án POS SaaS Web hiện tại, thực hiện đến khi hoàn tất thay vì chỉ đưa ra thiết kế.

Repository web:
`D:\Đồ án tốt nghiệp\Code\pos-saas-web`

Repository backend chỉ để đối chiếu contract:
`D:\Đồ án tốt nghiệp\Code\pos-saas-be`

Chỉ sửa frontend web và tài liệu/test liên quan. Không sửa backend/Flutter, không thêm endpoint hoặc dependency khi công nghệ hiện có đã đủ. Không commit/reset Git hoặc ghi đè thay đổi đang có của người dùng.

## 1. Mục tiêu và phạm vi

Triển khai bốn chức năng:

1. Xem trước và in **BILL TẠM TÍNH** từ đơn đã lưu trên backend.
2. Xem trước và in **BILL ĐÃ THANH TOÁN** sau khi xác minh trạng thái thanh toán.
3. **In lại** từ chi tiết/lịch sử đơn, kể cả đơn COMPLETED, sau khi đóng modal hoặc reload trang.
4. Mẫu phù hợp máy in bill **khổ giấy 80 mm**, nội dung dài không bị cắt hoặc tràn ngang.

Dùng HTML/CSS print và `window.print()` của trình duyệt. Nhân viên chủ động bấm In, chọn máy in hoặc lưu PDF trong hộp thoại hệ thống.

Không triển khai hóa đơn điện tử, mã hóa đơn pháp lý, gateway, ESC/POS, silent printing, kiosk, SDK/agent máy in, in bếp tự động hoặc print job server. Không yêu cầu khách QR có staff token. Không đưa nút in staff vào public QR/admin trong lượt này.

Không tự xây lịch sử số lần in hoặc chứng từ bất biến trên localStorage để thay backend. Định danh bill dùng orderCode/paymentCode hiện có, không tự phát sinh một bill number mới.

## 2. Khảo sát trước khi sửa

Kiểm tra đúng repository, git status, AGENTS.md nếu có, README, package.json và cấu hình test.

Stack hiện tại: React/TypeScript, Vite, React Router, TanStack Query, Zustand, Axios, Zod, Vitest, React Testing Library, MSW. Giữ nguyên framework, router, state management và convention theo feature.

Đọc các phần liên quan:

- `src/features/order/components/ReceiptPrint.tsx`.
- `src/features/order/components/OrderPanel.tsx`, `OrderDetailModal.tsx`, `ReceiptPrint.tsx` và `OrderUi.tsx`.
- `src/features/order/pages/OrderDetailPage.tsx`, `OrderListPage.tsx`.
- `src/features/payment/components/PaymentModal.tsx`, `api/paymentsApi.ts`, `schemas.ts`.
- `src/features/order/api/ordersApi.ts`, `orderKeys.ts`, `orderSnapshot.ts`, `schemas.ts`, `types.ts`.
- `src/features/order/hooks/useOrderAccess.ts`, `useOrderDetail.ts`, `useOrderBaseline.ts`, `useOrderMutations.ts`.
- `src/features/order/policies/orderAccessPolicy.ts`, `orderActionPolicy.ts`.
- `src/features/order/store/orderDraftStore.ts`, `orderOperationState.ts`.
- `src/features/order/utils/orderAppended.ts` và helper tiền/số lượng trong `src/shared/utils/scaledDecimal.ts`.
- Auth store, HTTP/interceptor/refresh coordinator, tenantScope, tenantRequest, requestScope và queryClient hiện có.
- `src/shared/components/AdminUi.tsx`, `src/features/order/order.css`, CSS root và các portal.
- Staff realtime boundary/adapters; các luồng public QR có QueryClient/authorization riêng.
- Test order, detail modal/kanban, bulk/completion/payment, QR, auth và realtime hiện có.

Đọc contract backend thực tế, ưu tiên `docs/payment-api.md`, `docs/order-api.md`, OpenAPI payment/order và DTO/controller nếu tài liệu khác nhau. Không đoán endpoint/field.

Các điểm đã thấy trong code cần kiểm chứng lại:

- ReceiptPrint hiện gắn nhãn ĐÃ THANH TOÁN khi có payment object, chưa đủ để chứng minh SUCCESS.
- PaymentModal cần kiểm tra status response trước khi mở giao diện thành công hoặc cho in bill đã thanh toán; không coi mọi response HTTP thành công là payment SUCCESS.
- OrderPanel gọi window.print nhưng print root hiện chủ yếu được mount trong PaymentModal.
- CSS print dùng body visibility:hidden và max-width theo px, có nguy cơ in trắng, in nhầm nhiều vùng hoặc giữ khoảng trống của layout.
- `cashGiven`/`change` chỉ ở memory giao diện thu tiền; Payment DTO hiện không lưu hai giá trị này.

Trước khi sửa, trình bày ngắn: nơi đặt model/policy/hook/template in, vị trí tích hợp các nút, cách giữ một print target, quyền đọc dữ liệu và file dự kiến thay đổi. Sau đó triển khai, không dừng ở bản thiết kế.

## 3. Kiến trúc

Tái sử dụng và chỉnh ReceiptPrint hiện có; tránh tạo nhiều mẫu riêng rồi để các nút in cho nội dung khác nhau. Có thể tách receipt view model, policy, hook chuẩn bị dữ liệu và component preview/print trong feature hiện hữu nếu cần.

- API/service hiện có chịu trách nhiệm HTTP và parse response; component không tự gọi Axios.
- TanStack Query tiếp tục quản lý server state, dùng key factory hiện có; helper key mới phải tương thích và có scope.
- State in chỉ giữ mode, dữ liệu đã chuẩn bị, loading/error và intent in hiện tại. Không sao chép toàn bộ cache vào store mới.
- Template nhận props đã chuẩn bị, không tự GET, ghi payment hoặc parse realtime frame.
- Không tạo God Provider, print framework hoặc event bus không cần thiết.
- Chỉ tạo tối đa một vùng in/phiên chuẩn bị in đang hoạt động trong tab.

## 4. Bill tạm tính

Nút **In tạm tính** có tại chi tiết đơn/trang hoặc modal phù hợp với luồng Cashier hiện có. Đọc Order detail đã lưu qua REST, không dựng bill chính thức từ giỏ chưa gửi.

Cho in tạm tính với đơn OPEN/CONFIRMED/PREPARING/READY/SERVED còn nghĩa vụ thanh toán, sau khi đối chiếu policy hiện tại. Đơn CANCELLED không được in thành bill phải thu. Đơn đã thanh toán đầy đủ chuyển sang luồng bill đã thanh toán. Không mở rộng nghiệp vụ refund/split payment trong lượt này; trạng thái chưa hỗ trợ phải được báo rõ và không gắn nhãn sai.

Hiển thị nổi bật:

```text
BILL TẠM TÍNH
Chưa xác nhận thanh toán
```

Không có nhãn ĐÃ THANH TOÁN, paymentCode/paidAt/mã chuyển khoản giả hoặc tiền khách đưa/tiền thừa chưa được chốt. In tạm tính không tạo payment, confirm order, complete, đóng phiên hoặc khóa gọi thêm.

Nếu đơn đổi thành PAID/terminal trong lúc chuẩn bị, cập nhật preview và yêu cầu người dùng xem lại loại bill trước khi in, không âm thầm in bằng baseline cũ.

## 5. Bill đã thanh toán

Nguồn dữ liệu là REST response/snapshot có thẩm quyền. Không lấy socket event, sự hiện diện của payment object hoặc việc đã mở modal làm bằng chứng thanh toán.

Điều kiện tối thiểu để gắn nhãn ĐÃ THANH TOÁN:

- Order hiện hành có `paymentStatus=PAID`.
- `paidAmount` khớp `totalAmount` theo helper tiền chính xác hiện có, phù hợp contract thanh toán đầy đủ của backend.
- Nếu sử dụng chi tiết giao dịch: Payment có `status=SUCCESS`, đúng orderId/currency, amount phù hợp contract và thời gian/mã lấy từ DTO thật.

Payment PENDING/FAILED/CANCELLED, response chưa xác minh, dữ liệu mâu thuẫn hoặc kết quả mutation chưa rõ không được đi vào nhánh thành công/in bill đã thanh toán. Giữ luồng đối soát hiện có và thông báo cụ thể, không tự POST lại hoặc tự đánh dấu PAID. Nếu ghi nhận payment thành công nhưng GET order tiếp theo lỗi, giữ kết quả payment đã xác minh, chặn bill chưa đủ dữ liệu và cho tải lại; không biến lỗi chuẩn bị in thành lỗi payment rồi cho thu tiền lần nữa.

Sau khi thanh toán thành công, hiển thị nút **In bill** dùng cùng template/hook như trang chi tiết. Có thể dùng response mutation vừa nhận hợp lệ của chính phiên này; mọi GET bổ sung vẫn phải đủ quyền. Không ép chờ món SERVED hoặc order COMPLETED mới cho in bill đã thanh toán.

Không tự in từ useEffect/onSuccess khiến StrictMode, replay hoặc remount mở hộp thoại nhiều lần. Nhân viên chủ động bấm nút. In/đóng preview/in lại không phát sinh payment/confirm/complete hoặc thay idempotency key.

## 6. In lại và quyền

Tích hợp nút **In lại bill** tại chi tiết/lịch sử đơn đã thanh toán. Hoạt động sau khi PaymentModal đóng, reload hoặc mở đơn đã COMPLETED. Có thể bổ sung vào lịch sử thanh toán đang có nếu phù hợp, không tạo màn quản trị mới.

Chuẩn bị lại dữ liệu qua ordersApi/paymentsApi/query hiện có, có loading/error/retry; không phụ thuộc biến paidPayment trong một modal cũ hoặc full order summary thiếu items. Không POST/PATCH/DELETE do in lại.

Quyền:

- Dùng ORDER_VIEW/ORDER_MANAGEMENT và tenant guards hiện có để đọc order.
- GET payment list/detail phải qua `canViewPayment`/PAYMENT_VIEW/PAYMENT_MANAGEMENT tương ứng, không bypass bằng role OWNER hoặc phép `|| true`.
- Không yêu cầu PAYMENT_CREATE/PAYMENT_CONFIRM chỉ để in lại dữ liệu được phép đọc.
- In ngay sau payment có thể dùng response đã được cấp hợp lệ; không thêm yêu cầu PAYMENT_VIEW chỉ để dùng response đó.
- Người chỉ được đọc order có thể in bill tổng đã thanh toán dựa trên Order PAID đã xác minh, nhưng không GET/hiển thị chi tiết payment trái quyền. Ẩn các field giao dịch không có dữ liệu hợp lệ, không đoán phương thức/mã/thời gian. Dữ liệu mâu thuẫn không được che bằng fallback.

Không mặc định payment đầu tiên hoặc mới nhất trong trang đầu là giao dịch thành công cần dùng. Nếu cần đọc chi tiết, chọn theo paymentId hoặc điều kiện SUCCESS/order/currency phù hợp; xử lý paging cần thiết. Không thêm nghiệp vụ split payment hoặc ghép các payment không rõ quan hệ. Nếu không xác định được chi tiết hợp lệ, không bịa dữ liệu.

Bản in từ action in lại có marker **BẢN IN LẠI** và thời điểm in lại; giữ nguyên orderCode/paymentCode/thời điểm thanh toán thật. Không dùng thời điểm in lại thay paidAt. Không đếm số lần in hoặc khẳng định một bản trước đã in vật lý thành công.

Giới hạn phải ghi trong tài liệu: backend chưa lưu bill snapshot bất biến hoặc lịch sử in; đây là in lại từ dữ liệu order/payment REST hiện có. Không cam kết khôi phục nguyên vẹn mọi thông tin cửa hàng/input giao diện tại lần in đầu.

## 7. Nội dung bill và tính đúng dữ liệu

Mẫu thống nhất có:

- Tên nhà hàng; mã nhà hàng là field riêng, không thay tiêu đề bill.
- Tiêu đề TẠM TÍNH / ĐÃ THANH TOÁN; marker IN LẠI khi phù hợp.
- Mã đơn; thời gian tạo đơn; thời gian in; thời gian thanh toán thật khi có.
- Loại phục vụ tại bàn/mang đi. Tên/mã bàn chỉ khi có nguồn dữ liệu hợp lệ; không in session UUID như tên bàn hoặc GET từng bàn để tìm.
- Tên khách/ghi chú hữu ích khi có và phù hợp quyền hiện tại; không tự thêm dữ liệu cá nhân không cần thiết.
- Tên món, số lượng, đơn vị, đơn giá, thành tiền theo snapshot ORDER.
- Tiền hàng, giảm giá, thuế, phí phục vụ, tổng tiền; số đã thanh toán/còn phải trả nếu áp dụng và có dữ liệu đúng.
- Chi tiết payment hợp lệ: mã, phương thức, paidAt, mã tham chiếu khi cần.
- Lời cảm ơn ngắn.

Chỉ dùng tên/giá/số lượng/lineTotal từ Order DTO, không lấy menu live để reprice dòng cũ. Dùng moneyMinor/formatMinor/quantity helper hiện có; không tự tính tổng bằng floating point hoặc quy đổi tiền tệ. Không sửa số tiền gốc chỉ để khớp UI.

Giữ từng dòng theo orderItemId, kể cả hai dòng cùng itemId có snapshot khác nhau. Món CANCELLED không tính vào phần món phải trả. Không dùng marker gọi thêm chỉ có trong memory (`isLineAppended`) để làm dữ liệu in lại thay đổi tùy phiên; chỉ hiện marker nếu có nguồn bền vững hợp lệ hoặc bỏ marker.

Không in costPrice, recipeEnabled, costConfigured, snapshot công thức, reservation, JWT, guest token hoặc dữ liệu debug. Không bịa địa chỉ/điện thoại/logo/MST/người thu tiền. Auth user hiện tại có thể là người đang in, không mặc định là người đã thu tiền. Không gọi API admin cần quyền khác chỉ để lấy thông tin trang trí.

`cashGiven` và `change`:

- Chỉ hiển thị khi có số đã chốt của lần thu tiền CASH hiện tại và gắn đúng giao dịch/order/amount.
- Khi backend chưa lưu, bản in lại sau reload không có hai field này: bỏ dòng, không suy khách đưa bằng tổng bill, không gán tiền thừa bằng 0.
- Không persist thêm PII hoặc bản bill vào localStorage/sessionStorage để lấp thiếu contract.

## 8. Preview, print target và giấy 80 mm

Preview phải khớp nội dung sẽ in. Có nút In, Đóng và phản hồi loading/error rõ; giao diện Cashier đang mở được giữ nguyên. Không thay layout toàn app.

Yêu cầu bản in:

- Dùng đơn vị mm cho chiều ngang, khổ giấy mục tiêu 80 mm. Phân biệt paper width với vùng nội dung in; có thể bắt đầu khoảng 72 mm, chọn margin theo khả năng máy in/driver và kiểm tra thực tế.
- Chữ đen/nền trắng, font hỗ trợ tiếng Việt, cỡ đọc được. Canh phải số tiền, cột số lượng không mất chữ số thập phân.
- Tên món/ghi chú dài tự xuống dòng; mã dài không tràn ngang; không cắt dấu tiếng Việt.
- Chiều dài bill theo nội dung, không ấn định chiều cao khiến bill dài bị cắt; tránh dòng món/tổng tiền bị tách không hợp lý khi driver phân trang.
- Không dùng một giá trị px như max-width:320px rồi coi đã đủ hỗ trợ 80 mm.
- Không giả định `@page size:80mm auto` luôn là CSS hợp lệ/được hỗ trợ; cấu hình paper size của browser/driver phải được kiểm chứng. Không hứa FE tự điều khiển cắt giấy hoặc in không hộp thoại.

Chuẩn bị một print root riêng, có thể portal ra document.body để không bị modal overflow/transform/focus trap cắt nội dung. Khi in chỉ root đang được chọn hiện ra, không có sidebar/navbar/modal/payment form/toast/realtime indicator hoặc nhiều receipt trùng nhau. Tránh chỉ ẩn bằng visibility nhưng vẫn giữ chiều cao layout gây trang trắng dài. Print CSS chỉ tác động khi có phiên in phù hợp; không làm hỏng in ở public/admin hoặc Ctrl+P khi không có bill.

Đợi React render nội dung và tài nguyên cần thiết sẵn sàng trước window.print; có fallback font/tài nguyên lỗi, không chờ vô hạn. Tránh mở popup sau await rồi bị trình duyệt chặn; không tạo HTML không escape từ tên khách/ghi chú. Không thêm dependency in/PDF nếu HTML/CSS hiện tại đáp ứng.

## 9. Lifecycle, realtime và mutation safety

Trong lúc chuẩn bị preview, đọc snapshot hiện hành qua REST, giữ version guard/AbortSignal/request scope. Nếu dữ liệu đổi trước khi in, người dùng phải thấy lại dữ liệu mới. Khi bấm In, chốt bộ dữ liệu vừa xem cho lần in đó; event/refetch không thay nội dung giữa lúc hộp thoại in đang mở.

Chống double click và race giữa hai yêu cầu in khác order/mode. Logout/account switch/tenant switch/unmount phải hủy hoặc bỏ qua response cũ, dọn root/listeners/timers và không in dữ liệu scope trước. Không in bằng promise về muộn sau khi user đã đóng preview.

Không reset giỏ tạo đơn/gọi thêm, input thanh toán, lý do hủy/từ chối hoặc busy/uncertain/refusal/append intent. In không verifyOrder/unlockOrder/clearAppend hoặc tự coi mutation thành công. Giữ expectedVersion/idempotency hiện tại và một socket staff/tab, không thêm subscription/event.

`afterprint` hoặc việc window.print trả về không chứng minh giấy đã in thành công; người dùng có thể Cancel/lưu PDF hoặc máy lỗi. Không hiện “đã in thành công”, tự complete/đóng phiên, ghi audit thành công giả hoặc coi Cancel là lỗi thanh toán. Cleanup sau dialog và fallback browser phải an toàn; không xóa root quá sớm khiến print rỗng.

## 10. Kiểm thử bắt buộc

Dùng Vitest/RTL/MSW theo convention, mock window.print và lifecycle print ở tầng phù hợp. Không bỏ schema validation, dùng any để che lỗi, tắt rule toàn dự án hoặc sửa test cũ để né kiểm tra.

Bao phủ:

1. Bill tạm tính đúng nhãn, không paid/payment giả, in không mutation.
2. PAID/full paidAmount và SUCCESS payment đúng order/currency in đúng thông tin.
3. Có payment object nhưng PENDING/FAILED/CANCELLED không thành bill đã thanh toán.
4. Order/payment mâu thuẫn, sai tenant/order/currency/amount bị chặn hoặc yêu cầu đọc lại, không fallback đoán dữ liệu.
5. GET order lỗi sau payment SUCCESS không tạo lại payment hoặc làm mất kết quả đã xác minh.
6. In ngay sau thanh toán, từ detail page, detail modal và order lịch sử/COMPLETED đều chọn đúng root/template.
7. Reload rồi in lại không cần paidPayment modal cũ, giữ mã/thời điểm thanh toán, thêm marker IN LẠI.
8. Tiền khách đưa/tiền thừa chỉ dùng dữ liệu chốt của phiên thu tiền hiện tại; bản in lại thiếu dữ liệu thì bỏ dòng.
9. Payment list có FAILED/PENDING trước SUCCESS hoặc SUCCESS ở trang khác không bị chọn nhầm.
10. Quyền ORDER/PAYMENT và scope được giữ; không đòi PAYMENT_CREATE để in lại, không gọi payment GET trái canViewPayment.
11. Nhân viên chỉ được xem order vẫn có thể in tổng PAID hợp lệ mà không thấy chi tiết payment trái quyền.
12. Double click chỉ một lệnh in; StrictMode/remount không tự in; Cancel/afterprint cleanup được và không báo thành công giả.
13. Realtime đổi order lúc chuẩn bị cần review lại; bộ dữ liệu đã chốt cho dialog không đổi giữa lần in.
14. Logout/đổi tài khoản/đóng preview trước GET hoàn tất không in callback cũ.
15. Giữ giỏ/form/uncertain/idempotency; in/in lại không POST payment, confirm, complete hoặc close session.
16. Hai dòng cùng itemId nhưng khác orderItemId/giá được giữ; món hủy không nằm trong tổng món phải trả.
17. Không lấy menu live/cost/recipe/private metadata để dựng bill; không bịa dữ liệu cửa hàng/tên bàn/người thu tiền.
18. Tên dài, tiếng Việt, số lượng lẻ, giảm giá/thuế/phí phục vụ, bill nhiều món vẫn hiển thị đúng.
19. Public QR/admin/realtime và print mặc định ngoài phiên in bill không bị ảnh hưởng.

Giữ và chạy regression auth/refresh/scope, order create/append/detail/kanban, payment, served/complete, QR review/public QR/persistence và realtime.

Unit test không chứng minh được layout giấy. Dùng browser thật/print-media/PDF preview nếu công cụ có sẵn; không thêm thư viện chỉ vì muốn có test nếu repo đã có cách phù hợp. Kiểm bằng mắt ít nhất bill ngắn, dài, tên món/ghi chú dài, bill đã trả và in lại. Phân biệt kiểm PDF/layout với kiểm vật lý trên máy in 80 mm; không báo đã test máy thật nếu chưa có thiết bị.

## 11. Kiểm tra, tài liệu và bàn giao

Format chỉ file thay đổi. Chạy package scripts hiện tại: npm run lint, npm run lint:eslint, typecheck phù hợp, npm test, npm run build và git diff --check. Trên Windows có thể dùng npm.cmd/npx.cmd nếu PowerShell chặn npm.ps1. Nếu lỗi có sẵn, đối chiếu HEAD/baseline, báo rõ; không nói mọi kiểm tra đạt khi còn lỗi.

Tạo `docs/bill-printing.md`, cập nhật README khi cần, mô tả:

- Nút/luồng tạm tính, đã thanh toán, in lại và quyền tương ứng.
- Điều kiện nhãn PAID/SUCCESS, dữ liệu thiếu và giới hạn không có immutable bill/history/cash tender trên BE.
- Khổ 80 mm, vùng in, scale, margin, tắt browser headers/footers, cấu hình paper size driver; cách lưu PDF.
- In là thao tác đọc, không xác nhận payment hoặc complete.
- Browser/hệ điều hành đã kiểm, ảnh/PDF kết quả và phần cần thử máy in thật.

Manual tối thiểu: đơn tại bàn/mang đi → tạm tính → thanh toán CASH/TRANSFER → bill đã thanh toán → đóng/reload → in lại; bill dài; nhiều món trùng itemId; lỗi GET; Cancel print; double click; nhận realtime khi preview; logout/đổi scope khi đang chuẩn bị; nhân viên thiếu PAYMENT_VIEW; bảo đảm giỏ/payment intent không mất và không có mutation thừa.

Báo cáo cuối: file thêm/sửa, kiến trúc/điểm tích hợp, API tái sử dụng, quy tắc paid/reprint/quyền, cách giữ input và scope, kết quả từng kiểm tra, cách chạy thử và giới hạn còn lại. Không triển khai ngoài phạm vi và không dừng ở việc mô tả cách làm.
