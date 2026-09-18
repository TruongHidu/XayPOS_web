# POS SaaS Web — System Admin

React + TypeScript SPA cho `SUPER_ADMIN`, cùng auth shell cho tenant POS và public QR flow. Phần System Admin dùng API thật, React Query cho server state và URL làm nguồn trạng thái cho các bộ lọc danh sách.

## Chạy local

```bash
npm install
copy .env.example .env # Windows; dùng cp trên macOS/Linux
npm run dev
```

Vite chạy tại `http://localhost:3000`. API mặc định là `http://localhost:8080/api/v1`; đổi bằng `VITE_API_BASE_URL`. Backend cần cho phép CORS từ `http://localhost:3000`.

```bash
npm run lint
npm run lint:eslint
npm test
npm run build
```

## Admin routes

- `/admin/dashboard`: dashboard summary từ `GET /admin/dashboard/summary`; chỉ hiển thị các số backend trả về, không tự suy diễn revenue/MRR/ARR/churn/payment.
- `/admin/restaurants`: list có search, status filter, pagination và sort; criteria được đồng bộ vào URL.
- `/admin/restaurants/:restaurantId`: detail nhà hàng, OWNER/users summary, effective/latest subscription và đổi status qua `PATCH`.
- `/admin/subscriptions`: global subscription list có search, filter, effective flag, pagination và sort.
- `/admin/restaurants/:restaurantId/subscriptions`: lịch sử subscription của một nhà hàng.
- `/admin/restaurants/:restaurantId/subscriptions/:subscriptionId`: detail và immutable feature snapshot.
- `/admin/subscriptions/operations`: tạo `PENDING`, activate, change package và cancel bằng UUID đã biết.
- `/admin/features`: catalog feature, search/filter, create/update/deactivate.
- `/admin/features/:featureCode`: feature detail, code immutable và link update theo permission.
- `/admin/packages`: catalog package, search/filter, create/update/deactivate.
- `/admin/packages/:packageCode`: package detail và mapping feature với `limits` là plain JSON object.
- `/admin/audit-logs`: audit log read-only, filter theo scope/actor/action/entity/time và xem `beforeData`/`afterData` redacted.
- `/403`: trạng thái forbidden dùng chung cho route/permission guard.

## API modules

API được tách theo domain tại `src/features/admin/api`, không có `AdminService` tổng hợp và component không gọi Axios trực tiếp.

| Module | Endpoint chính |
| --- | --- |
| `adminDashboardApi` | `GET /admin/dashboard/summary` |
| `restaurantsApi` | `GET /admin/restaurants`, `GET /admin/restaurants/{id}`, `PATCH /admin/restaurants/{id}/status` |
| `adminSubscriptionsApi` | `GET /admin/subscriptions`, list/detail theo restaurant, create/activate/change-package/cancel |
| `featuresApi` | list/detail/create/update feature |
| `packagesApi` | list/detail/create/update và add/remove feature mapping |
| `auditApi` | `GET /admin/audit-logs` |

Mọi query key nằm trong `adminKeys.ts`; mutation thành công invalidate các list/detail/dashboard liên quan. Query retry chỉ áp dụng cho network/5xx, không retry lỗi validation, 403 hay 404.

## Permission và bảo mật

Admin route yêu cầu `SUPER_ADMIN` và `restaurantId === null`. Các permission được áp dụng như sau:

- `ADMIN_DASHBOARD_VIEW`: dashboard.
- `RESTAURANT_VIEW` / `RESTAURANT_MANAGE`: xem / đổi status nhà hàng.
- `SUBSCRIPTION_VIEW` / `SUBSCRIPTION_MANAGE`: xem / tạo và vận hành subscription.
- `PACKAGE_VIEW` / `PACKAGE_MANAGE`: xem / sửa feature, package và mapping.
- `AUDIT_VIEW`: xem audit log.

Menu được ẩn theo permission, route vẫn được guard và mutation cũng kiểm tra permission ở handler. Tất cả domain API dùng Axios client chung của Phase 1:

- access token chỉ ở memory;
- refresh token rotation dùng single-flight coordinator và `sessionStorage` hiện tại;
- business `403` không bị refresh/logout nhầm;
- logout clear auth state và TanStack Query cache.

## Nghiệp vụ quan trọng

- Feature/package chỉ deactivate bằng `active=false`, không hard-delete.
- Package mapping mới chỉ chọn feature active và validate `limits` là JSON object.
- Subscription detail hiển thị snapshot từ response, không join lại catalog hiện tại để thay thế snapshot cũ.
- `change-package` kết thúc subscription cũ và tạo subscription mới theo backend contract; `autoRenew` chỉ là dữ liệu lưu trữ, chưa phải thanh toán/gia hạn tự động.
- Chuyển thời gian từ `datetime-local` sang ISO-8601 UTC; UI ghi rõ `startAt` inclusive và `endAt` exclusive.
- Audit log không có mutation UI và giữ nguyên marker `[REDACTED]` từ backend.

## Contract và giới hạn

Repository hiện không chứa `docs/openapi/admin-api.yaml` hoặc `docs/admin-api.md`; phần admin được triển khai theo contract trong yêu cầu đã cung cấp. Frontend không thêm endpoint ngoài contract và không dùng production mock data. MSW chỉ được dùng trong test.

Các module POS/menu/order/kitchen/payment và public QR vẫn là shell/placeholder ngoài phạm vi admin hiện tại. Backend vẫn cần bảo đảm các quy tắc domain tương ứng, đặc biệt snapshot bất biến và mọi transition `EXPIRED` đi qua service expiration dùng chung.

## Kiểm thử

Test hiện có bao phủ auth/interceptor/routing, permission guards, API path/DTO, feature/package CRUD, dashboard, restaurant list/detail, subscription list/detail/operations và audit validation/read-only/redaction. Chạy toàn bộ bằng `npm test`.
