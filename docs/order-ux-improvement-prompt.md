# Prompt cải thiện giao diện gọi món — Bàn, Thực đơn, Giỏ & Đơn

Bạn là lập trình viên frontend phụ trách dự án Xây POS hiện tại (`D:\Đồ án tốt nghiệp\Code\pos-saas-web`). Hãy cải thiện trải nghiệm gọi món của CASHIER trên `/cashier/pos`: chọn bàn, chọn món từ thực đơn, quản lý giỏ, gửi đơn và chuyển sang thu tiền. Mục tiêu là thao tác nhanh, ít bước, chuyển cảnh mượt và **không làm hỏng bất kỳ hành vi hay cấu hình nào đang chạy**. Triển khai đầy đủ, chạy được và tự kiểm tra; không dừng ở mức đề xuất thiết kế.

Ràng buộc cứng:

- Chỉ sửa frontend. Không đổi backend, API contract, DTO, query key hay route.
- Không thêm dependency (không thư viện animation, UI kit hay icon pack mới). Chuyển cảnh dùng CSS transition/keyframes và state React sẵn có.
- Không commit, không reset, không stash. Working tree đang có thay đổi chưa commit của tính năng in hóa đơn: `src/App.tsx`, `src/features/order/components/OrderPanel.tsx`, `OrderDetailModal.tsx`, `ReceiptPrint.tsx`, `order.css`, `utils/orderErrors.ts`, `src/features/payment/components/PaymentModal.tsx`, thư mục `src/features/order/printing/`, `src/features/payment/utils/` và các test in. Phải sửa chồng lên các thay đổi này, không ghi đè, không hoàn tác.
- Không thay state management (Zustand + TanStack Query), không đổi cấu trúc thư mục feature.

## 1. Mục tiêu và phạm vi

Trong phạm vi:

- `src/features/order/pages/CashierPosPage.tsx`: top bar chuyển mang đi/tại bàn, sub-nav tại bàn, tab mobile (tables / menu / cart), lưới 2 cột `order-pos-grid`, nút giỏ nổi trên mobile.
- `components/TableSelector.tsx`: sơ đồ bàn, lọc khu vực, trạng thái bàn.
- `components/MenuPicker.tsx`: tìm kiếm, lưới món, phân trang/infinite.
- `components/OrderCart.tsx` và `DraftLineForm`: dòng món, số lượng, ghi chú, tổng tiền, nút gửi đơn.
- Màn hình sau khi gửi đơn (`OrderPanel` hiển thị trong POS) và điểm mở `PaymentModal`.
- `components/OrderAddItems.tsx`, `OrderEditor.tsx`: dùng chung ngôn ngữ thiết kế mới khi gọi thêm/sửa dòng.

Ngoài phạm vi (giữ nguyên):

- Trang QR công khai (`src/features/qr-menu`, `src/features/qr-order`), hàng đợi duyệt QR (`src/features/qr-order-review`), bếp, admin, dashboard.
- Logic thanh toán và xác nhận SUCCESS trong `PaymentModal`, nội dung mẫu bill và luồng in (`printing/`, `ReceiptPrint.tsx`).
- Danh sách đơn/kanban (`OrderListPage.tsx`), trừ chỉnh sửa CSS dùng chung nếu cần để thống nhất token.

## 2. Khảo sát trước khi sửa

- Stack: React 19, TypeScript, Vite, React Router 7, TanStack Query 5, Zustand 5, Zod, Tailwind 4 (chỉ dùng lẻ tẻ), CSS toàn cục kiểu BEM trong `src/features/order/order.css` với token `--pos-*` ở `:root`.
- Đọc kỹ trước khi sửa:
  - `src/App.tsx` và `src/portals/cashier/CashierShell.tsx` (wrapper `pos-page-transition`).
  - `src/features/order/store/orderDraftStore.ts`: `lines`, `context`, `scope`, các trạng thái `pending` / `uncertain` / `refused` / `submitted` / `result` / `error`, helper `draftDirty`, `draftFrozen`, `draftTotal`.
  - `hooks/useOrderServiceContext.ts`, `hooks/useOrderMenuPicker.ts`, `hooks/useDraftNavigationGuard.ts` (`confirmDraftExit`), `hooks/useOrderMutations.ts`, `hooks/useOrderAccess.ts`.
  - `policies/orderAccessPolicy.ts`, `policies/orderActionPolicy.ts`.
  - `components/OrderUi.tsx` (`OrderFeedback`, `OrderPager`), `components/ServiceIcon.tsx`.
  - `src/shared/utils/scaledDecimal.ts` (`formatMinor`, `moneyMinor`, `previewLine`): mọi số tiền phải đi qua các helper này.
  - `src/App.css` và `order.css`: các keyframes `posPageFadeIn`, `fadeIn`, `scaleUp`, `skeletonPulse`; tìm chỗ trùng lặp.
  - Test liên quan trong `src/test/`: `orderUi.test.tsx`, `orderStore.test.ts`, `orderDetailModalAndKanban.test.tsx`, `cashierWorkflowApi.test.ts`, `paymentPrintSafety.test.tsx`, `receiptWorkflow.test.tsx`, `staffRealtime.test.tsx`, `routing.test.ts` và fixtures `orderFixtures.ts`.
- Grep `src/test` để liệt kê class name, role, label và text mà test đang dùng để chọn phần tử. Không đổi các selector đó; nếu bắt buộc đổi thì cập nhật test tương ứng và ghi rõ lý do.
- Trước khi sửa, trình bày ngắn gọn: (a) danh sách điểm vướng UX quan sát được khi chạy thực tế, (b) kế hoạch thay đổi theo từng file, (c) rủi ro hồi quy và cách tránh.

## 3. Nguyên tắc thiết kế và chuyển động

- Dùng lại token `--pos-*` (màu, radius 8/12/16px, shadow) và class theme `theme-dine_in` (cam) / `theme-takeaway` (xanh). Không tạo bảng màu mới; nếu thiếu token thì thêm biến `--pos-*` vào cùng khối `:root`.
- Chuyển động:
  - Thời lượng 150–250ms; chỉ animate `transform` và `opacity`, không animate `width`, `height`, `top`, `left` hay `box-shadow` trên danh sách dài.
  - Dùng lại easing `cubic-bezier(0.16, 1, 0.3, 1)` đang có; gom vào biến CSS (ví dụ `--pos-ease`, `--pos-duration-fast`, `--pos-duration`).
  - Thay `transition: all` bằng danh sách thuộc tính cụ thể ở những chỗ đã chạm tới.
  - Thêm khối `@media (prefers-reduced-motion: reduce)` toàn cục tắt/giảm animation và transition (hiện chưa có).
  - Gộp `posPageFadeIn` đang khai báo ở cả `App.css` và `order.css` về một nơi duy nhất, giữ nguyên tên class `pos-page-transition`.
- Không gây nhảy layout: skeleton cùng kích thước với nội dung thật, giữ chỗ cho badge/số lượng, nút không đổi kích thước khi chuyển sang pending.
- Khả dụng: vùng chạm ≥ 44px, focus bàn phím nhìn thấy rõ (`:focus-visible`), màu luôn đi cùng nhãn chữ/biểu tượng, nhãn tiếng Việt, `aria-live` cho thông báo thêm món và trạng thái gửi đơn.
- Responsive: dùng tốt ở 360px (điện thoại), 768px (tablet ngang/dọc) và ≥ 1280px (máy POS). Không cuộn ngang trang.

## 4. Chọn bàn (TableSelector)

- Thẻ bàn hiển thị rõ: tên/số bàn, khu vực, trạng thái (Trống / Có khách / Không hoạt động) bằng pill màu + chữ + icon; bàn không chọn được thì disabled kèm lý do, giữ nguyên điều kiện hiện có (`status !== 'AVAILABLE'`, `area.active === false`, ...).
- Cải thiện thanh chip khu vực sẵn có: cuộn ngang mượt trên mobile, chip đang chọn nổi bật, giữ nút tải thêm khu vực. Nếu thêm ô tìm bàn hoặc lọc theo trạng thái thì lọc phía client trên dữ liệu đã tải, không đổi query.
- Trạng thái tải dùng skeleton dạng lưới thay cho dòng chữ "Đang tải bàn..." (giữ `role="status"` cho trình đọc màn hình); lỗi và rỗng dùng `OrderFeedback` hiện có với nút thử lại.
- Khi chọn bàn: phản hồi trực quan tức thì (trạng thái chọn + pending trong lúc chuẩn bị phiên), sau khi thành công trên mobile tự chuyển sang tab thực đơn với chuyển cảnh nhẹ. URL query (`serviceType`, `tableSessionId`, `tableId`) vẫn là nguồn sự thật; reload trang phải khôi phục đúng màn hình.
- Hiển thị rõ bàn đang phục vụ ở top bar/sub-nav (tên bàn, khu vực, nút đổi bàn). Đổi bàn khi giỏ còn món phải đi qua `confirmDraftExit`.
- Bàn đã có phiên: hiển thị đơn hiện có của phiên (`SessionOrders`) gọn gàng, có thể thu gọn, không làm mất giỏ đang soạn.

## 5. Thực đơn (MenuPicker)

- Ô tìm kiếm luôn trong tầm tay (sticky ở đầu cột), có debounce hợp lý, nút xóa, phím Esc để xóa; không gây bão request và tôn trọng infinite query trong `useOrderMenuPicker`.
- Nếu dữ liệu menu/API hiện có cung cấp danh mục thì thêm thanh danh mục sticky cuộn ngang; nếu không có thì không tự bịa danh mục và không gọi API mới.
- Thẻ món: ảnh `imageUrl` có fallback khi thiếu/lỗi, tên tối đa 2 dòng, giá canh rõ, kích thước thẻ đồng đều.
  - Chạm/click để thêm 1 món, có phản hồi nhanh (nhấn nhún nhẹ, hiệu ứng "+1", thông báo `aria-live`).
  - Badge góc thẻ hiển thị số lượng món đó đang có trong giỏ, lấy từ `orderDraftStore`.
  - Món hết/không bán: disabled, mờ, có nhãn, không thêm được.
- Khi giỏ đang `draftFrozen` (đang gửi / uncertain), thẻ món không cho thêm và có giải thích ngắn.
- Giữ vị trí cuộn và từ khóa tìm kiếm khi chuyển qua lại giữa các tab mobile.
- Skeleton cho lần tải đầu và cho trang tiếp theo; giữ `OrderPager`/tải thêm hiện có.

## 6. Giỏ và gửi đơn (OrderCart)

- Dòng món: tên, đơn giá, stepper số lượng (− / số / +) với vùng chạm lớn, ghi chú inline có thể mở/đóng, nút xóa dòng. Giảm về 0 thì hỏi xác nhận hoặc cho hoàn tác nhanh, không xóa im lặng.
- Thêm/xóa dòng có animation fade/slide nhẹ; dòng vừa thêm được làm nổi bật thoáng qua; danh sách tự cuộn tới dòng mới.
- Khu tổng tiền (số món, tạm tính bằng `draftTotal`/`formatMinor`) và nút gửi đơn luôn hiển thị ở chân giỏ (sticky), kể cả khi danh sách dài.
- Trạng thái rỗng thân thiện, gợi ý bước tiếp theo (chọn bàn hoặc chọn món tùy chế độ).
- Nút gửi đơn ánh xạ đúng trạng thái store:
  - `pending`: spinner, disabled, không double-submit.
  - `uncertain`: thông báo chưa xác định kết quả, nút "Thử lại" dùng lại đúng idempotency key đã lưu trong `submitted`, không tạo key mới.
  - `refused`: hiển thị lỗi dễ hiểu qua `orderErrors.ts`, cho phép sửa giỏ.
  - Thành công: chuyển sang bước 7.
- Nút "Xóa giỏ" luôn hỏi xác nhận và gọi `discard` của store.
- Mobile: nút giỏ nổi hiển thị số món và tổng tiền, có hiệu ứng nảy nhẹ khi thêm món; mở giỏ dạng bottom sheet hoặc tab với chuyển cảnh trượt lên, đóng được bằng nút, vuốt/nhấn nền và phím Esc, giữ focus trap khi mở.

## 7. Sau khi gửi đơn và chuyển sang thu tiền

- Hiển thị xác nhận thành công rõ ràng (số đơn, bàn/mang đi, tổng tiền) với chuyển cảnh mượt sang `OrderPanel`.
- Giữ nguyên hành vi chuyển hướng tới `/cashier/orders` sau 600ms và việc bỏ qua timer ở mode `test`. Nếu thêm nút "Thanh toán ngay" / "Gọi món tiếp", nút đó phải hủy timer chuyển hướng một cách an toàn (clear timeout khi unmount hoặc khi người dùng chọn hành động).
- "Thanh toán ngay" mở `PaymentModal` hiện có với props `{ order, onClose, onSuccess }` và chỉ hiện khi người dùng có quyền thanh toán (`PAYMENT_CREATE`, entitlement `PAYMENT_MANAGEMENT`) theo policy sẵn có.
- Không sửa logic xác nhận SUCCESS, logic in, `ReceiptButton` hay `ReceiptPrintingProvider`.

## 8. Những thứ không được phá vỡ

- Đồng bộ scope draft qua `OrderRuntimeBoundary` và cảnh báo rời trang qua `useDraftNavigationGuard` / `confirmDraftExit`.
- Idempotency key khi tạo đơn, các trạng thái `uncertain` / `refused`, mutation theo version trong `useOrderMutations`.
- `refetchOnWindowFocus` phụ thuộc trạng thái realtime trong `useOrderDetail`; invalidation realtime trong `realtime/orderAdapter.ts`.
- Phân quyền và entitlement: `POS_QUICK_ORDER` (mang đi), `TABLE_MANAGEMENT` (tại bàn), `ORDER_CREATE`, `ORDER_UPDATE`, `PAYMENT_*`, `TABLE_VIEW`, `MENU_VIEW`. Hành động không có quyền vẫn ẩn hoặc disabled như hiện tại; không hiện tên permission thô cho người dùng.
- Một print root duy nhất `#staff-receipt-print-root`; CSS mới không được làm ảnh hưởng `@media print` và `receipt.css`.
- Query key trong `api/orderKeys.ts`, đường dẫn route, tên và ý nghĩa các query param.
- Biến môi trường `VITE_REALTIME_ENABLED`, `VITE_ENABLE_QR_API` và các hành vi phụ thuộc.
- Selector mà test hiện có đang dùng (class, role, label, text).
- CSS mới phải gắn prefix `pos-`/`order-` và không đè lên style của QR, admin hay bếp.

## 9. Kiểm thử bắt buộc

Thêm test trong `src/test/orderUi.test.tsx` hoặc file mới `src/test/orderUx.test.tsx`, dùng fixtures `orderFixtures.ts` và MSW như các test hiện có:

1. Luồng tại bàn: chọn bàn trống → chuyển sang thực đơn → thêm món → tăng/giảm/xóa dòng → gửi đơn thành công.
2. Luồng mang đi: thêm món → gửi đơn, không yêu cầu chọn bàn.
3. Bàn không khả dụng/khu vực ngừng hoạt động không chọn được và có nhãn lý do.
4. Badge số lượng trên thẻ món khớp với giỏ.
5. Món không bán bị disabled và không thêm được.
6. Khi `pending`, nút gửi bị disabled; nhấn nhiều lần chỉ gửi một request.
7. Khi `uncertain`, thử lại dùng lại cùng idempotency key.
8. Khi `refused`, hiển thị lỗi và giỏ vẫn sửa được.
9. Đổi bàn/rời trang khi giỏ có món sẽ gọi `confirmDraftExit`.
10. Người dùng thiếu quyền tạo đơn/thanh toán không thấy hành động tương ứng.
11. Nút "Thanh toán ngay" (nếu thêm) mở `PaymentModal` và hủy timer chuyển hướng.
12. Xóa giỏ cần xác nhận.
13. Tab mobile giữ từ khóa tìm kiếm khi chuyển qua lại.

Hồi quy: toàn bộ test hiện có của order, payment, in bill, realtime, QR và routing phải xanh.

## 10. Kiểm tra, tài liệu và bàn giao

- Chạy `npm run lint`, `npm test`, `npm run build` và `git diff --check`; sửa hết lỗi do thay đổi của bạn gây ra.
- QA thủ công trên trình duyệt ở 360px, 768px và 1280px, cả chế độ tại bàn và mang đi, với `prefers-reduced-motion` bật và tắt. Kiểm tra luồng chọn bàn → chọn món → gửi đơn → thanh toán → in bill vẫn chạy như trước.
- Viết `docs/order-ux.md` mô tả ngắn: thay đổi UX theo từng màn, token/biến chuyển động mới, các quyết định thiết kế và cách kiểm tra thủ công.
- Báo cáo cuối: danh sách file đã sửa/thêm, những gì đã làm theo từng mục 4–7, kết quả lint/test/build, các điểm chưa làm hoặc cần backend hỗ trợ (ví dụ danh mục món nếu API chưa có).
