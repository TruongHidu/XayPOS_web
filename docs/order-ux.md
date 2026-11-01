# Tài liệu Cải thiện Trải nghiệm Gọi món (Order UX) — Cashier POS

Tài liệu tóm tắt các cải tiến UX/UI trên màn hình `/cashier/pos`, hệ thống token chuyển động, các quyết định thiết kế và quy trình kiểm tra thủ công.

---

## 1. Tổng quan thay đổi UX theo từng màn

### 1.1. Chọn bàn (`TableSelector.tsx`)
- **Ô tìm kiếm bàn client-side**: Cho phép gõ tìm nhanh số bàn/tên bàn trên dữ liệu khu vực đã tải, có nút xóa nhanh (x) và phím `Esc` để hủy tìm kiếm.
- **Lưới Skeleton mượt mà**: Thay thế văn bản tải bằng lưới các ô bàn skeleton với hiệu ứng nhịp độ mờ (`posSkeletonPulse`), có thuộc tính `role="status"` và `<span className="sr-only">Đang tải bàn...</span>` hỗ trợ accessibility cho screen reader.
- **Phản hồi xúc giác tức thì (Tactile Feedback)**: Khi cashier chạm/click vào bàn, bàn hiển thị trạng thái đang chọn (`choosingId`) ngay lập tức trong khi phiên đang được chuẩn bị.
- **Hiển thị lý do không khả dụng rõ ràng**: Bàn bị khóa (`status !== 'AVAILABLE'` hoặc khu vực tạm ngưng) hiển thị pill trạng thái trực quan: `Không hoạt động`, `Khu vực tạm ngưng`, `Cần quyền mở bàn`, `Đang chuẩn bị...` thay vì chỉ disable mờ nhạt.
- **Tự động chuyển tab trên mobile**: Sau khi chọn bàn thành công trên màn hình điện thoại, giao diện tự động chuyển sang tab Thực đơn với transition nhẹ.

### 1.2. Thực đơn (`MenuPicker.tsx`)
- **Thanh tìm kiếm Sticky cố định**: Luôn nổi ở đầu danh sách món khi cuộn, tích hợp debounce hợp lý, nút xóa nhanh (Clear) và phím tắt `Esc`.
- **Badge số lượng tức thì trên thẻ món**: Mỗi thẻ món có badge góc (`pos-menu-card-badge`) hiển thị số lượng món đó đang có trong giỏ hàng (lấy trực tiếp từ `orderDraftStore.lines`).
- **Hiệu ứng Pop khi chọn món**: Khi click/chạm vào thẻ món, hiệu ứng nhún nảy nhẹ (`posBadgePop`) và thông báo ẩn `aria-live="polite"` thông báo cho trình đọc màn hình: `"Đã thêm [Tên món] vào giỏ"`.
- **Image Fallback**: Thẻ món hiển thị icon và placeholder trang nhã khi món không có ảnh (`imageUrl`) hoặc ảnh bị lỗi đường truyền.
- **Trạng thái giỏ đóng băng (`draftFrozen`)**: Khi đơn đang được gửi (`pending`) hoặc chưa rõ kết quả (`uncertain`), thẻ món bị khóa kèm banner thông báo `Giỏ hàng đang được xử lý, tạm thời không thể thêm món`.
- **Giữ trạng thái tìm kiếm**: Khi cashier chuyển đổi qua lại giữa các tab trên mobile, từ khóa tìm kiếm và kết quả lọc vẫn được lưu giữ.

### 1.3. Giỏ hàng & Soạn dòng (`OrderCart.tsx`)
- **Bộ điều khiển số lượng (Stepper) đạt chuẩn touch ≥ 44px**: Nút `−` và `+` có kích thước lớn, dễ thao tác trên màn hình cảm ứng hoặc máy tính bảng POS.
- **Xác nhận khi giảm về 0**: Ngăn chặn việc bấm nhầm làm mất món, cashier nhận hộp thoại xác nhận trước khi xóa dòng.
- **Ghi chú Inline tiện lợi**: Cho phép bấm "Thêm ghi chú" để nhập trực tiếp ghi chú cho từng dòng món mà không cần mở modal phức tạp.
- **Nút "Xóa giỏ" an toàn**: Cho phép xóa toàn bộ món đang soạn với xác nhận rõ ràng, gọi `s.discard()`.
- **Animation thêm dòng & Auto-scroll**: Dòng món mới thêm xuất hiện với hiệu ứng làm sáng viền (`posLineHighlight`), danh sách tự động cuộn nhẹ xuống món mới.
- **Khu vực chân giỏ Sticky**: Tổng tiền (định dạng chuẩn `formatMinor`/`draftTotal`) và nút "Gửi đơn" luôn cố định ở đáy giỏ hàng.
- **Khôi phục lỗi Uncertain an toàn**: Khi gặp sự cố mạng (`uncertain`), hiển thị hộp cảnh báo kèm nút "Thử lại gửi đơn", tái sử dụng chính xác `idempotencyKey` đã lưu để tránh tạo đơn trùng lặp.
- **Trạng thái rỗng thân thiện**: Gợi ý cashier các bước tiếp theo (chọn bàn ở chế độ tại bàn hoặc chọn món ở chế độ mang đi).

### 1.4. Màn hình sau khi gửi đơn & Chuyển sang thu tiền (`CashierPosPage.tsx`)
- **Thẻ tóm tắt thành công (Post-submission Summary Card)**: Hiển thị nổi bật mã đơn hàng, loại hình dịch vụ, bàn phục vụ, số lượng món và tổng tiền.
- **Nút "Thanh toán ngay" (Pay Now)**: Khi cashier có quyền thanh toán (`canPay` và `canPayment(access)`), nút xuất hiện nổi bật để cashier thu tiền ngay tại chỗ. Bấm nút sẽ hủy an toàn bộ hẹn giờ tự động chuyển trang (`clearTimeout`) và mở ngay `PaymentModal`.
- **Drawer giỏ hàng trên mobile**: Có lớp nền mờ (`pos-mobile-cart-backdrop`), đóng mở bằng phím `Esc`, vuốt hoặc nút đóng giỏ.

---

## 2. Hệ thống Motion Tokens & CSS Tokens mới

Các biến CSS token được tập trung trong `:root` của [order.css](file:///d:/%C4%90%E1%BB%93%20%C3%A1n%20t%E1%BB%91t%20nghi%E1%BB%87p/Code/pos-saas-web/src/features/order/order.css):

```css
:root {
  --pos-duration-fast: 150ms;
  --pos-duration: 220ms;
  --pos-ease: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### Các keyframes hiệu ứng:
- `posBadgePop`: Phóng to nhẹ và nảy badge số lượng khi thêm món.
- `posLineHighlight`: Làm sáng nhẹ nền và viền của dòng món mới thêm trong giỏ hàng.
- `posSheetSlideUp`: Trượt giỏ hàng từ dưới lên trên mobile.
- `posDrawerFadeIn`: Làm mờ và hiện lớp nền backdrop giỏ hàng mobile.
- `posSkeletonPulse`: Nhịp thở sáng/tối đồng đều cho skeleton loading của bàn và món.

### Hỗ trợ tiếp cận toàn cục (`prefers-reduced-motion`):
Đã thêm khối quy tắc trong [App.css](file:///d:/%C4%90%E1%BB%93%20%C3%A1n%20t%E1%BB%91t%20nghi%E1%BB%87p/Code/pos-saas-web/src/App.css):
```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 3. Các quyết định thiết kế cốt lõi

1. **Bảo toàn 100% test selectors và accessibility**: Giữ nguyên toàn bộ `aria-label`, `role`, text node và test id mà test suite của dự án sử dụng (ví dụ: `aria-label={t.name + ' ' + (hasSession ? 'Đang sử dụng' : 'Còn trống')}`, `aria-label={'Thêm ' + item.name}`).
2. **Không thêm dependency bên ngoài**: Toàn bộ animation và hiệu ứng chuyển cảnh được thực hiện bằng CSS thuần và state React có sẵn.
3. **Bảo tồn tính năng in hóa đơn**: Giữ nguyên vẹn `#staff-receipt-print-root`, `@media print`, và không can thiệp vào `receipt.css` hay các file in trong working tree.
4. **Idempotency & Khả năng chịu lỗi**: Tôn trọng chặt chẽ idempotency key khi tạo đơn và xử lý trạng thái `uncertain`/`refused`.
5. **Khuôn khổ Theme**: Tận dụng triệt để hai chủ đề màu có sẵn `theme-dine_in` (màu cam ấm) và `theme-takeaway` (màu xanh hiện đại).

---

## 4. Hướng dẫn kiểm tra thủ công (Manual QA)

### 4.1. Kiểm tra luồng Tại bàn (Dine-in)
1. Đăng nhập với tài khoản Cashier, truy cập `/cashier/pos`.
2. Kiểm tra thanh chọn phương thức: tab "Tại bàn" được kích hoạt (theme cam).
3. Tại sơ đồ bàn:
   - Gõ tìm kiếm bàn trên ô tìm kiếm (thử gõ số bàn và nhấn nút xóa hoặc phím `Esc`).
   - Click vào một bàn trống: bàn chuyển sang trạng thái đang chuẩn bị, sau đó mở menu món.
4. Tại thực đơn:
   - Nhập tên món vào ô tìm kiếm: kết quả lọc mượt mà, sticky ở đầu trang.
   - Click vào món bất kỳ: badge số lượng trên thẻ món nảy số `1`, `2`,...
5. Tại giỏ hàng:
   - Bấm `+` / `−` trên stepper để tăng/giảm số lượng.
   - Giảm số lượng về 0: hộp thoại xác nhận hiển thị; chọn hủy sẽ giữ nguyên số lượng.
   - Bấm "Thêm ghi chú", nhập ghi chú inline và lưu.
   - Bấm "Gửi đơn": nút chuyển sang pending có spinner, sau đó đơn gửi thành công.
6. Sau khi gửi đơn:
   - Thẻ tóm tắt xuất hiện hiển thị mã đơn, tổng tiền, thông tin bàn.
   - Bấm "Thanh toán ngay": modal thanh toán (`PaymentModal`) mở ra ngay lập tức, bộ đếm tự động chuyển trang bị hủy.

### 4.2. Kiểm tra luồng Mang đi (Takeaway)
1. Trên top bar, bấm chuyển sang "Mang đi" (theme xanh).
2. Màn hình thực đơn mở ngay lập tức, không yêu cầu chọn bàn.
3. Thêm món vào giỏ hàng và kiểm tra tổng tiền.
4. Bấm "Gửi đơn" và kiểm tra luồng thanh toán tương tự.

### 4.3. Kiểm tra Responsive & Motion
- **360px (Điện thoại)**: Kiểm tra các tab điều hướng dưới đáy/đầu trang (Bàn / Thực đơn / Giỏ), nút giỏ hàng nổi mở drawer trượt lên từ đáy, phím `Esc` hoặc bấm nền đóng drawer mượt mà.
- **768px (Tablet)** và **1280px (POS)**: Bố cục 2 cột hiển thị đầy đủ, giỏ hàng bên phải cố định, danh sách món bên trái cuộn mượt.
- **Prefers-reduced-motion**: Bật "Emulate CSS prefers-reduced-motion: reduce" trong DevTools > Rendering, kiểm tra giao diện phản hồi tức thì mà không có chuyển cảnh dư thừa.
