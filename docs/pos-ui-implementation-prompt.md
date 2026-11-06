# Prompt triển khai web Cashier: gọi món và thanh toán

Bạn là lập trình viên frontend phụ trách dự án POS SaaS hiện tại. Hãy tiếp tục triển khai giao diện web dành cho CASHIER để gọi món và thanh toán, dựa trên 4 ảnh tham chiếu người dùng cung cấp. Điều chỉnh giao diện theo mã đang có, quyền và API thực tế của dự án. Hoàn thành mã chạy được và kiểm tra kết quả.

Phạm vi lần triển khai này chỉ gồm POS mang đi/tại bàn, gọi thêm vào đơn hiện tại, xem/tìm đơn để thu tiền, thanh toán tiền mặt hoặc chuyển khoản do thu ngân tự đối soát và xem giao dịch của từng đơn nếu có quyền. Các trạng thái chế biến/giao món chỉ dùng để hiển thị tiến độ từ backend. Không triển khai màn hình bếp/KDS, thao tác bắt đầu nấu/đánh dấu sẵn sàng/giao món, hoàn tất đơn hoặc đóng phiên bàn. Không tự thêm portal quản lý, waiter hoặc chức năng quản trị danh mục. Nếu dự án đã có các module đó thì giữ nguyên, không xóa hoặc mở rộng trong lần triển khai này.

## 1. Đọc dự án trước khi sửa

- Stack hiện tại: React 19, TypeScript, Vite, React Router, TanStack Query, Axios, Zustand, React Hook Form, Zod, CSS/Tailwind. Tận dụng các thư viện đang có, không thay state management hoặc tự thêm UI framework.
- Đọc `src/App.tsx`, `src/portals/cashier/CashierShell.tsx`, `src/features/order`, `src/features/menu`, `src/features/tables`, `src/features/payment`, `src/shared/api` và các test liên quan.
- Đọc `docs/cashier-order.md`. Khi có backend cục bộ, đối chiếu DTO/controller và tài liệu order/payment mới nhất trong `../pos-saas-be`. Backend có nhiều API hơn phạm vi web Cashier; chỉ kết nối các API phục vụ gọi món và thanh toán.
- Giữ các thay đổi chưa commit của người dùng. Tập trung vào cashier/order/POS; giữ nguyên nghiệp vụ admin, auth và QR menu công khai.
- Dùng lại phần SUBMIT, active-order, đọc/sửa đơn và gọi thêm có idempotency của `ordersApi`; phần ghi nhận/list/detail của `paymentsApi`; phần đọc bàn/khu vực/phiên của `cashierTablesApi`. Các adapter bếp/complete/close có sẵn không đồng nghĩa phải tạo UI hoặc gọi chúng.
- Tiếp tục từ giao diện đang triển khai, tái sử dụng component/hook/store/CSS phù hợp. Không dựng lại toàn bộ ứng dụng, thêm dependency hoặc sửa backend khi contract hiện có đã đáp ứng nghiệp vụ.

## 2. Hướng thiết kế từ ảnh tham chiếu

Ảnh 084850: POS mang đi, danh mục bên trái và hóa đơn bên phải, tông xanh.
Ảnh 084907: sơ đồ bàn nằm trong vùng nội dung trái của POS.
Ảnh 084921: thực đơn của bàn đang chọn, giỏ bên phải, tông cam.
Ảnh 084806: tham chiếu bố cục danh sách đơn 3 cột, bộ lọc và thẻ đơn. Thay các nút vận hành bếp trong ảnh bằng thao tác xem đơn/gọi thêm/thu tiền của Cashier.

Giữ cấu trúc và cảm giác của ảnh, đồng thời làm bố cục cân đối, rõ trạng thái và thuận tiện thao tác:

- Giao diện tiếng Việt, nền `#f6f7f9`, surface trắng, chữ đậm màu xanh đen, border xám nhạt, bo góc 12–16px, bóng nhẹ.
- Xanh chính gần `#009b72`; cam cho tại bàn/chờ xử lý; tím để hiển thị trạng thái đang chế biến; xanh cho món sẵn sàng/đã giao. Màu luôn đi cùng nhãn và biểu tượng.
- Dùng font hiện có của dự án, cỡ nội dung 14–16px, tiêu đề 22–26px; khoảng cách 8/12/16/24px. Tiền canh phải, số liệu dễ đọc.
- Dùng SVG/icon hiện có; ảnh món lấy `imageUrl` thật, có fallback khi thiếu hoặc tải lỗi. Không lấy tên món, số bàn, ảnh, tổng tiền hoặc tài khoản mẫu trong ảnh làm dữ liệu production.
- Nút có hover, focus, pending, disabled rõ ràng. Không hiển thị ID kỹ thuật, tên permission hoặc key idempotency trong luồng thường dùng; lỗi thiếu quyền có thông báo dễ hiểu.

## 3. Màn hình POS `/cashier/pos`

### Bố cục

- POS chiếm toàn bộ không gian làm việc; thu gọn/ẩn sidebar riêng tại route POS nếu cần. Thanh đầu cao khoảng 56px gồm nút quay lại và tiêu đề “Bán hàng (POS)”. Quay lại phải giữ cơ chế cảnh báo giỏ chưa gửi.
- Desktop >=1200px: vùng chọn món/bàn co giãn ở trái; giỏ rộng khoảng 350–390px ở phải. Hai vùng cuộn độc lập, tổng tiền và nút chính luôn dễ thấy.
- Tab dịch vụ “Mang đi” và “Tại bàn”. Trong Tại bàn, có điều hướng “Chọn bàn”/“Thực đơn” kèm tên bàn đang chọn. Không biến “Thực đơn cho bàn” thành serviceType thứ ba.
- Tablet: giỏ khoảng 320px và lưới món co theo chiều rộng. Mobile: chuyển panel Bàn/Thực đơn/Giỏ bằng tab hoặc drawer; có nút xem giỏ với số món/tổng dự kiến. Không tràn ngang ở 390px, không che nút chính khi mở bàn phím.
- Giữ deep link hiện có: `?serviceType=TAKEAWAY`, `?serviceType=DINE_IN`, `?tableId=<uuid>`, `?tableSessionId=<uuid>`. Validate query trước request, không chấp nhận đồng thời tableId và tableSessionId.

### Thực đơn

- Thanh tìm kiếm phía trên, chip “Tất cả” và nhóm món từ API. Search debounce khoảng 300ms, đổi nhóm/search thì reset page; không bỏ mất kết quả ngoài trang đầu.
- Grid card rộng khoảng 145–180px, ảnh cao 110–135px, tên món tối đa hai dòng và giá VND màu xanh. Số cột tự thích ứng theo vùng trái.
- Nhấn card thêm món vào giỏ local. Cho sửa số lượng, ghi chú và xóa dòng. Không tự gộp dòng khác ghi chú hoặc gộp món mới vào snapshot món đã gửi.
- Chỉ dùng private menu sellable. Có skeleton, không có kết quả, lỗi kèm thử lại; không dùng public QR API để vượt quyền.

### Sơ đồ bàn

- Hiển thị khu vực, tên/mã bàn, sức chứa khi có ích, trạng thái trống/đang sử dụng. Card responsive, kích thước hợp lý; không kéo mỗi bàn thành ô cực lớn khi ít dữ liệu.
- Lọc khu vực và Tất cả/Đang sử dụng/Còn trống trên server. Danh mục khu vực và bàn đều xử lý phân trang.
- `status=AVAILABLE` là cấu hình bàn. Dùng `occupied/currentSession` xác định bàn có khách; `canOpen` xác định bàn trống có thể chọn. Bàn/khu vực ngừng hoạt động bị khóa.
- Chọn bàn trống chỉ cập nhật local context bằng `tableId`; không POST mở phiên. Nhập số khách ở giỏ. Chỉ POST `/orders` khi nhấn “Gửi đơn”; backend mở phiên và đơn trong cùng transaction.
- Bàn có phiên: đọc current-session và active-order. Có order thì mở đúng orderId để xem/gọi thêm. Không chọn đơn đầu/cuối từ lịch sử và không tạo đơn mới thay cho order đang phục vụ.
- active-order trả 204: cho tạo đơn trong phiên OPEN nếu đủ quyền. 404/403/409 không được coi là “chưa có order”.

### Giỏ và gửi đơn

- Header “Đơn mang đi” màu xanh hoặc “Tại bàn · <tên bàn>” màu cam, thông tin khách tùy chọn ở trên, danh sách dòng cuộn ở giữa, phần tiền và nút chính ở dưới.
- Giỏ trống có minh họa đơn giản và “Chọn món từ thực đơn”; nút gửi bị khóa nếu chưa có món/chưa chọn bàn/không đủ quyền/đang gửi.
- Hiển thị tạm tính, giảm giá hiện có và tổng dự kiến. Sau khi lưu, lấy subtotal/discount/tax/serviceCharge/total/currency từ server; không thêm UI sửa giảm giá khi API chưa hỗ trợ.
- Nút chính là “Gửi đơn” hoặc “Gửi món thêm”. Nhãn “Xuất hóa đơn” trong ảnh chỉ là tham chiếu hình thức, không dùng cho request tạo đơn hoặc thu tiền.
- Mang đi tạo `serviceType=TAKEAWAY`, `sourceChannel=CASHIER`, `submissionMode=SUBMIT`; bỏ tableId/tableSessionId khỏi payload.
- Tại bàn tạo `serviceType=DINE_IN`, `sourceChannel=CASHIER`, `submissionMode=SUBMIT`, đúng một tableId hoặc tableSessionId.
- SUBMIT thành công đã là CONFIRMED, không gọi `/confirm` lần hai. `/confirm` chỉ dành cho đơn nháp OPEN đã tồn tại.
- Gọi thêm gửi riêng những dòng mới với expectedVersion, SUBMIT và key ổn định vào `/orders/{id}/items`; không tạo root order khác.
- Sau khi gửi thành công, hiển thị đơn đã lưu, các món và tổng tiền chính thức, cho “Gọi thêm” nếu chưa PAID và “Thu tiền” nếu đủ quyền. Thu tiền là thao tác riêng trên orderId đã có; lỗi thanh toán không được khiến frontend tạo lại đơn.

## 4. Danh sách đơn để thu ngân theo dõi và thu tiền `/cashier/orders`

- Header “Quản lý đơn hàng”, số đơn phù hợp từ dữ liệu thật, nút “Làm mới”, “Lịch sử”, “Bán hàng (POS)”. Lịch sử dùng bộ lọc terminal và phân trang, không dựng endpoint mới.
- Thanh filter gồm tìm kiếm qua `q`, loại đơn, trạng thái, chip nhanh và số lượng theo từng nhóm; state đồng bộ URL.
- Desktop dùng 3 cột theo ảnh; mỗi cột có header màu nhạt, icon, nhãn, bộ đếm và danh sách cuộn. Mobile dùng tab nhóm hoặc các section xếp dọc.
- Ánh xạ đầy đủ trạng thái: “Chờ xử lý” gồm OPEN/CONFIRMED (OPEN có badge Nháp); “Đang chế biến” là PREPARING; “Sẵn sàng / Đã giao” gồm READY/SERVED với badge phân biệt. COMPLETED/CANCELLED vào lịch sử. Đơn nháp có sẵn chỉ giữ action sửa/xác nhận theo quyền và contract hiện tại, không thêm luồng lưu nháp mới.
- READY hiển thị “Món sẵn sàng”; SERVED hiển thị “Đã giao món”. Cashier đọc các trạng thái này từ backend, không cung cấp nút chuyển trạng thái phục vụ. PAID là trạng thái thanh toán riêng; đơn đã trả tiền vẫn có thể đang chế biến hoặc phục vụ.
- Card gồm mã đơn, thời gian chờ tính từ timestamp thật, khách hoặc “Khách vãng lai”, loại đơn/bàn nếu dữ liệu có, trạng thái thanh toán, tổng tiền và action. Không hiển thị QR badge nếu nguồn không phải QR.
- List trả OrderSummaryResponse không có items, không suy ra số món. Chỉ tải detail khi mở/expand/chọn đơn để xem snapshot và thao tác; tránh một GET detail cho mọi card mỗi lần refresh.
- Bộ đếm tổng lấy totalElements từ các query trạng thái tương ứng với cùng filter; mỗi trạng thái có phân trang riêng hoặc “Tải thêm”. Nếu chỉ biết số card đang tải thì ghi rõ số đang hiển thị. Không dùng độ dài trang đầu làm tổng toàn bộ.
- Các action trên card/chi tiết chỉ gồm “Chi tiết”, “Gọi thêm” khi hợp lệ và “Thu tiền” khi hợp lệ. Đơn đã PAID hiển thị badge “Đã thanh toán”, số tiền đã trả và xem giao dịch nếu có PAYMENT_VIEW. Không hiển thị “Bắt đầu nấu”, “Món sẵn sàng”, “Giao món”, “Hoàn tất” hoặc “Đóng bàn” dưới dạng nút.
- “Thu tiền” không phụ thuộc đơn đã READY/SERVED: có thể thu khi CONFIRMED/PREPARING nếu backend cho phép. Không thêm tham số paymentStatus vào list nếu backend không hỗ trợ; trạng thái thanh toán trên card lấy từ response.
- Không kéo thả đơn để đổi trạng thái. Tiến độ phục vụ có thể cập nhật bằng refetch/polling GET orders/detail đang hiển thị; không tạo WebSocket hoặc query queue bếp cho portal Cashier.

## 5. Thanh toán dành cho Cashier

- Các action có guard quyền/feature tại UI, route, hook/handler. Dùng boundary portal và effective permissions hiện có; không cấp quyền chỉ vì tài khoản có role CASHIER hoặc một packageCode. Không mở thêm màn quản trị/bếp trong navigation của lần triển khai này.
- “Thu tiền” mở modal chọn CASH hoặc TRANSFER. Trước khi xác nhận intent mới, GET order mới nhất, hiển thị tổng chính thức để nhân viên xác nhận, dùng đúng totalAmount và version mới; không gửi preview giỏ hoặc tiền khách đưa làm amount.
- Modal hiển thị mã đơn, bàn/loại đơn, khách, danh sách món hoặc phần tóm tắt và tổng phải thu. Tiền mặt có thể nhập “Khách đưa” và hiển thị “Tiền thừa” bằng phép tính tiền chính xác, chỉ dùng ở UI; payload amount luôn bằng totalAmount. Khóa xác nhận nếu tiền khách đưa không đủ hoặc dữ liệu đang tải/gửi.
- TRANSFER bắt buộc referenceNo và nhân viên đã tự đối soát. Không mô phỏng QR ngân hàng, webhook hoặc thanh toán tự động.
- Tạo thanh toán thành công/replay trả PaymentResponse, không có version order mới: GET lại order, cập nhật detail và invalidate list/payments.
- Thanh toán có thể diễn ra khi món chưa giao; không tự đánh SERVED/COMPLETED/CLOSED sau thu tiền.
- Khi payment đã SUCCESS, hiển thị rõ “Đã thanh toán” và mã giao dịch. Nếu GET order sau đó thất bại, giữ payment thành công và cho tải lại đơn; không báo thu tiền thất bại hoặc tạo một payment mới.
- Đơn đã PAID khóa gọi thêm và thu lại tiền. Retry của intent thanh toán chưa rõ kết quả vẫn dùng key/body gốc để lấy replay, không bị nhầm với một yêu cầu thu tiền mới.
- Bàn vẫn có thể occupied sau thanh toán. Hiển thị đúng response và thông báo ngắn “Đã thanh toán, phiên bàn vẫn đang phục vụ” khi phù hợp. Không thêm complete/close hoặc tự giải phóng bàn để che trạng thái này.
- Lịch sử giao dịch chỉ theo từng order qua API list/detail payments và PAYMENT_VIEW. Không thêm trang quản lý doanh thu, đối soát tổng, hoàn tiền hoặc API thanh toán toàn nhà hàng.
- API hiện ghi nhận thanh toán đủ totalAmount một lần. Không dựng thanh toán một phần hoặc hoàn tiền chỉ vì schema có enum PARTIALLY_PAID/REFUNDED; trạng thái ngoại lệ nếu có chỉ hiển thị và hướng dẫn kiểm tra.
- Nếu có chức năng in, dùng bản xem trước từ snapshot đã lưu và browser print. Không gọi đó là hóa đơn điện tử hoặc tự tạo endpoint xuất hóa đơn chưa tồn tại.

## 6. Contract API phải giữ đúng

Base URL môi trường đã chứa `/api/v1`. Adapter dùng path tương đối dưới đây, không lặp prefix. Tenant từ JWT; không gửi restaurantId. Authorization/refresh dùng httpClient hiện có. Accept JSON; Content-Type chỉ khi có JSON body.

| Nghiệp vụ          | Method/path                                                      | Body/query quan trọng                                                                              |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Nhóm/món           | GET `/menu/groups`, `/menu/items`                                | active/sellable, groupId, q, page, size                                                            |
| Bàn/khu vực        | GET `/tables`, `/table-areas`                                    | status, occupied, areaId, active, page, size                                                       |
| Đọc bàn            | GET `/tables/{id}`                                               | Không body                                                                                         |
| Phiên hiện tại     | GET `/tables/{id}/current-session`                               | 200 hoặc 204                                                                                       |
| Đọc phiên          | GET `/table-sessions/{id}`                                       | Session có version riêng                                                                           |
| Đơn đang phục vụ   | GET `/table-sessions/{id}/active-order`                          | 200 OrderResponse hoặc 204                                                                         |
| Danh sách/chi tiết | GET `/orders`, `/orders/{id}`                                    | serviceType, status, tableSessionId, q, sortBy, direction, page, size                              |
| Gửi đơn mới        | POST `/orders`                                                   | SUBMIT, đúng seating, items; Idempotency-Key                                                       |
| Gọi thêm           | POST `/orders/{id}/items`                                        | expectedVersion, SUBMIT, items mới; Idempotency-Key                                                |
| Xác nhận nháp      | POST `/orders/{id}/confirm`                                      | expectedVersion                                                                                    |
| Sửa nháp           | PATCH `/orders/{id}`, `/orders/{id}/items/{lineId}`              | expectedVersion; OPEN-only                                                                         |
| Hủy món/đơn đã có  | POST `/orders/{id}/items/{lineId}/cancel`, `/orders/{id}/cancel` | Chỉ giữ luồng sẵn có theo quyền/guard; không thêm chức năng mới                                    |
| Thu tiền           | POST `/orders/{id}/payments`                                     | expectedOrderVersion, CASH/TRANSFER, amount=totalAmount, referenceNo khi TRANSFER; Idempotency-Key |
| Lịch sử thanh toán | GET `/orders/{id}/payments`, `/orders/{id}/payments/{paymentId}` | page, size khi list                                                                                |

Permission/feature:

- Đọc đơn: ORDER_VIEW + ORDER_MANAGEMENT.
- Gửi mới SUBMIT: ORDER_CREATE + ORDER_UPDATE + ORDER_MANAGEMENT; TAKEAWAY thêm POS_QUICK_ORDER, DINE_IN thêm TABLE_MANAGEMENT; bàn chưa có phiên thêm TABLE_OPEN.
- Gọi thêm SUBMIT: ORDER_UPDATE + ORDER_MANAGEMENT + feature theo loại đơn. canAppend riêng, không nới canEdit để sửa món/thông tin cũ sau confirm.
- Menu: MENU_VIEW + MENU_MANAGEMENT. Bàn/phiên: TABLE_VIEW + TABLE_MANAGEMENT.
- Thanh toán: PAYMENT_CREATE + PAYMENT_CONFIRM + PAYMENT_MANAGEMENT; xem payment dùng PAYMENT_VIEW.
- Không yêu cầu KITCHEN_DISPLAY, các quyền KITCHEN, ORDER_MARK_SERVED, ORDER_COMPLETE hoặc TABLE_CLOSE cho web Cashier trong phạm vi này. Đọc tiến độ đơn dùng ORDER_VIEW.

Không kết nối `/kitchen/items`, `/start-cooking`, `/mark-ready`, `/mark-served`, `/orders/{id}/complete` hoặc `/table-sessions/{id}/close` vào luồng Cashier. Không tự mở phiên bằng POST `/tables/{id}/sessions` lúc chọn bàn. Các API này thuộc luồng nghiệp vụ khác, giữ nguyên adapter sẵn có.

## 7. Idempotency, version và xử lý lỗi

- Một intent tạo/gọi thêm/thanh toán gồm scope, target, body bất biến và key UUID riêng. Khóa double click, không tự retry mutation vô điều kiện.
- Network/timeout/5xx/response malformed: giữ nguyên key, body, expectedVersion và target để nhân viên kiểm tra lại bằng yêu cầu ban đầu. Replay không phụ thuộc version/status/menu/seating trong cache hiện tại; vẫn cần scope/quyền hiện tại hợp lệ.
- Tạo từ tableId retry vẫn dùng tableId gốc, không thay bằng tableSessionId mới. Gọi thêm retry không thay expectedVersion bằng GET mới. Thanh toán retry không GET rồi xây body khác với cùng key.
- Giữ frozen append đang có trong orderOperationState qua đóng/mở modal; GET đối chiếu không tự chứng minh intent đã thành công. Bổ sung intent/payment hook theo cùng nguyên tắc.
- 409 CONCURRENT_ORDER_UPDATE/CONCURRENT_TABLE_UPDATE: giữ giỏ/form, tải lại order/session để so sánh; không tự tạo root order khác, đổi target hoặc gửi lại với version mới. TABLE_SESSION_HAS_SERVING_ORDER không tự chuyển giỏ thành append.
- IDEMPOTENCY_KEY_REUSED/PAYMENT_IDEMPOTENCY_KEY_REUSED: giữ intent và thông báo cần kiểm tra, không tự sinh key khác.
- 401 đi qua auth coordinator, business403 không refresh-loop. 400 hiển thị fieldErrors; 404 không fallback sang create. Giữ error.code cho logic, thông báo tiếng Việt cho người dùng.
- Query key có scope và target/filter. Thành công lấy response authoritative, bảo vệ khỏi GET cũ ghi đè version mới; invalidate list, active-order, bàn/phiên/payment khi liên quan. Không tạo query bếp trong các màn Cashier; giữ cơ chế invalidation dùng chung đã có nếu cần cho hồi quy.
- Logout/đổi tenant/quyền xóa state/cache riêng tư và bỏ response trễ. Không lưu token/PII/intent vào localStorage; store hiện tại chỉ memory. Không tự submit khi remount/refresh.

## 8. Kiểm tra và bàn giao

- Giữ và mở rộng test MSW/Vitest phù hợp: SUBMIT không confirm lần hai; chọn bàn không mở phiên; occupied mở active order; gọi thêm đúng id; retry cùng key/body kể cả version đã đổi; DRAFT cũ; quyền/feature; thanh toán đúng amount/version; chuyển khoản cần referenceNo; payment SUCCESS nhưng GET order lỗi không thu lại; thanh toán khi chưa lên món; PAID không tự complete/close hoặc làm bàn trống; lỗi giữ nháp; logout bỏ response trễ.
- Kiểm tra portal Cashier không có menu/action bếp, giao món, complete/close và không phát request đến các endpoint đó. Không thêm các quyền ngoài phạm vi để làm cho giao diện giống ảnh.
- Chạy `npm.cmd test -- --reporter=dot --maxWorkers=2`, lint các file thay đổi, `npm.cmd run lint`, `npm.cmd run build`; nếu baseline có lỗi ngoài phạm vi thì nêu cụ thể, không báo đã build thành công.
- Kiểm tra giao diện ở 1920/1366/1024/768/390px bằng trình duyệt nếu có. Kiểm tra cuộn panel, loading/empty/error, ảnh lỗi, bàn dài tên, món dài tên, đơn nhiều dòng, keyboard/focus/modal và không tràn ngang.
- Không thêm mock data production, endpoint giả hoặc chức năng backend chưa có. Không triển khai/publish tự động.
- Kết thúc báo file đã sửa, nghiệp vụ đã kết nối, kiểm thử đã chạy và giới hạn còn lại. Đính kèm ảnh kiểm tra giao diện nếu công cụ hỗ trợ.
