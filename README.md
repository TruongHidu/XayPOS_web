# POS SaaS Web — Phase 1

React + TypeScript SPA cho ba portal: System Admin, Cashier/POS và public QR Menu.

## Chạy local

```bash
npm install
copy .env.example .env # Windows; dùng cp trên macOS/Linux
npm run dev
```

Vite chạy tại `http://localhost:3000`. API mặc định là `http://localhost:8080/api/v1`; thay đổi qua `VITE_API_BASE_URL`. Backend cần cho phép CORS origin `http://localhost:3000`.

```bash
npm run lint
npm run test
npm run build
```

## Auth và bảo mật

- Access token chỉ giữ trong memory; không ghi vào localStorage, URL hoặc log.
- Refresh token giữ trong `sessionStorage` với key namespace `pos.refreshToken`.
- Refresh rotation dùng single-flight coordinator, thay cặp token nguyên tử và retry protected request tối đa một lần.
- Authentication-style `403` không có `code` được thử refresh; business `403` không refresh.
- Logout luôn clear local auth state và TanStack Query cache trong `finally`.
- TODO backend: chuyển refresh token sang cookie `HttpOnly + Secure + SameSite` khi backend hỗ trợ.

## Phase 1 đã có

Login, bootstrap phiên khi reload, `/auth/me` contract, entitlement, logout, route/role/permission/tenant/feature guards, redirect theo role, status pages, admin/cashier shells và QR route public.

## Blocker backend và phạm vi chưa làm

Không triển khai CRUD Phase 2 hoặc gọi API giả. Backend hiện chưa có API danh sách nhà hàng, tạo nhân viên, phân quyền nhân viên, đổi/reset/quên mật khẩu, menu, bàn, order, kitchen, payment, public QR token/menu/order, session management, MFA. Vì vậy admin chưa thể chọn restaurant để quản lý subscription hoàn chỉnh; tài khoản CASHIER/WAITER/KITCHEN phải tồn tại sẵn trong DB. QR Menu chỉ hiển thị placeholder khi `VITE_ENABLE_QR_API=false`.

## Đề xuất Phase 2

Kết nối CRUD feature/package/subscription bằng TanStack Query; bổ sung API restaurant/staff trước khi xây màn hình quản trị; sau đó triển khai menu, POS/order/kitchen/payment và QR adapter khi backend contract ổn định.
