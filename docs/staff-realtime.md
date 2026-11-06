# Staff realtime trên Cashier Web

Web dùng native WebSocket, STOMP 1.2 (`@stomp/stompjs`), một physical socket cho mỗi tab nhân viên. Mutation vẫn qua REST; event chỉ báo cần đọc lại snapshot, không thay thế DTO hoặc xác nhận một command thành công.

## Bật / tắt và triển khai

```env
VITE_REALTIME_ENABLED=true
# Không bắt buộc; bỏ dòng này để suy từ REST base URL.
VITE_REALTIME_URL=ws://localhost:8080/ws
```

Đây là cấu hình Vite tại thời điểm build. Đổi cấu hình cần khởi động lại dev server hoặc build/deploy lại. Không thêm JWT, refresh token hoặc guest token vào env/URL.

URL tự suy:

| REST base                             | WebSocket                      |
| ------------------------------------- | ------------------------------ |
| `http://localhost:8080/api/v1`        | `ws://localhost:8080/ws`       |
| `https://api.example.com/api/v1`      | `wss://api.example.com/ws`     |
| `https://api.example.com/pos/api/v1/` | `wss://api.example.com/pos/ws` |

Chỉ bỏ hậu tố `/api/v1`, giữ context path; không tạo `/api/v1/ws`. Override phải là `ws:`/`wss:`, không userInfo, query hoặc fragment. Trang HTTPS bắt buộc WSS. Cấu hình sai đưa realtime vào trạng thái blocked, REST vẫn hoạt động.

Browser tự gửi Origin. Cấu hình đúng origin của web, ví dụ `http://localhost:3000`, trong `app.cors.allowed-origins` của backend; không giả Origin hoặc mở wildcard. Reverse proxy phải chuyển WebSocket upgrade và giữ đúng context path. Ví dụ Nginx với API tại root:

```nginx
# Trong http block:
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}

# Trong server block; upstream pos_api được cấu hình riêng:
location /ws {
  proxy_pass http://pos_api;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 90s;
}
```

Nếu proxy rewrite prefix, đặt URL override khớp đường dẫn công khai. Không chèn Authorization vào browser HTTP upgrade: bearer được gửi trong STOMP CONNECT. Không dùng SockJS/Socket.IO.

Tắt bằng `VITE_REALTIME_ENABLED=false`: không tạo client, giữ REST và QR polling 10 giây. Chỉ báo nhỏ trong cashier thể hiện trạng thái; mất socket không khóa gọi món. Khi đạt giới hạn kết nối, đóng bớt tab rồi dùng **Thử lại** (tối đa một lần mỗi 30 giây).

## Ownership và scope

- `src/shared/realtime`: transport, lifecycle, parser, dedupe cache, query invalidator và context trạng thái.
- `src/portals/cashier/StaffRealtimeBoundary.tsx`: composition auth/consumer/lifecycle; mount duy nhất tại route `/cashier`, bao quanh `CashierShell`.
- `src/portals/cashier/staffRealtimeRuntime.ts`: owner theo module, giữ chuỗi teardown bất đồng bộ qua StrictMode/remount; HMR dừng client.
- Adapter nghiệp vụ nằm tại `features/order/realtime`, `features/qr-order-review/realtime`, `features/kitchen/realtime`.

Không tạo client trong render. Setup/cleanup đồng bộ chặn callback bằng generation trước khi chờ đóng socket. Kết nối tiếp theo chỉ được activate sau khi `deactivate({ force: true })` của physical client trước hoàn tất. STOMP quản lý encoding, heartbeat 10s và timeout CONNECT 10s; runtime là nơi duy nhất retry (`reconnectDelay: 0` trong thư viện).

Token chỉ ở memory. `subscribeAccessToken` thông báo thay đổi biến module; CONNECT luôn đọc lại `getAccessToken`. Chỉ gửi `Authorization` và `host`, thư viện tạo `accept-version:1.2`/heartbeat. Không login/passcode, tenant/user header, refresh token hoặc guest token. Debug/raw-frame logging tắt.

Expiry qua ERROR hoặc close reason dùng `refreshWithCoordinator` chung với interceptor REST. Hai nguồn cùng hết hạn dùng chung single-flight. Token đổi reconnect nhưng không thay tenant scope nếu identity/quyền không đổi, không reset draft. Refresh trả về muộn sau logout không được phục hồi phiên. Lỗi mạng socket không logout; auth flow hiện có quyết định khi refresh thất bại.

Data scope dùng `tenantScope`/`orderScope`. `sessionRevision` và transport generation phân biệt logout/login lại cùng tài khoản. `tenantRequest` kiểm tra cả revision, epoch và scope; queryFn dùng AbortSignal. Callback/frame/promise của runtime cũ bị bỏ qua. Teardown dọn retry timer, heartbeat của client, subscriptions, debounce, event caches và browser/store listeners.

Không mount staff runtime tại login, SUPER_ADMIN, public QR/menu hoặc guest receipt. Public QR tiếp tục ở ngoài `AuthBootstrap`, dùng public HTTP client, QueryClient riêng và guest receipt polling. Không đổi guest storage hoặc cơ chế phục hồi giỏ. Staff event không clear/invalidate cache admin/public.

## Channel policy

| Channel                         | Permission     | Feature                                | Consumer hiện tại                     |
| ------------------------------- | -------------- | -------------------------------------- | ------------------------------------- |
| `/user/queue/orders`            | ORDER_VIEW     | ORDER_MANAGEMENT                       | Cashier list/detail/bàn               |
| `/user/queue/qr-order-requests` | ORDER_VIEW     | ORDER_MANAGEMENT                       | Backlog/notification QR trong cashier |
| `/user/queue/kitchen-orders`    | KITCHEN_VIEW   | KITCHEN_DISPLAY                        | Chỉ khi có query kitchen đang active  |
| `/user/queue/inventory-alerts`  | INVENTORY_VIEW | INVENTORY_MANAGEMENT + LOW_STOCK_ALERT | Chưa subscribe, chỉ có policy         |

Kho giữ allowlist OWNER/MANAGER/WAITER/KITCHEN riêng; CASHIER có ORDER_VIEW vẫn nghe ORDER/QR. Kitchen-only không cần ORDER_VIEW/INVENTORY_VIEW. QR backlog không cần feature QR ordering hoặc quyền approve; mutation kiểm tra riêng.

Chỉ subscribe sau STOMP CONNECTED, mỗi destination một lần, ID dạng `staff:<channel>:<sequence>` hợp lệ, `ack:auto`, tối đa bốn destination đã định nghĩa. Không SEND/ACK/NACK, wildcard, raw queue/topic hoặc user tự khai. UNSUBSCRIBE chỉ gỡ đúng channel. CONNECTED hoặc gửi SUBSCRIBE không phải xác nhận đã được cấp quyền channel.

FORBIDDEN/FEATURE_NOT_ENTITLED có subscription ID sẽ fence đúng channel, giữ các channel khác và bỏ channel đó khi reconnect. Không có ID thì chặn kết nối để tránh đoán nhầm. Revalidate `/auth/me` + `/me/entitlements` qua auth store, gộp tối đa một lượt/30s; không refresh token chỉ để kiểm quyền. Policy thay đổi thật sẽ tính lại subscriptions. REST access failure và resume cũng yêu cầu revalidation vì backend có thể fence âm thầm.

ACCOUNT_INACTIVE, RESTAURANT_INACTIVE, SUBSCRIPTION_NOT_ACTIVE, protocol/configuration và các lỗi limit dừng retry tự động. Close 1008 không reason không bị coi mặc định là token expired. Refresh bị từ chối lặp lại trước CONNECTED cũng dừng. Lỗi mạng/REALTIME_SHUTDOWN dùng exponential backoff với jitter, tối đa 30s; offline dừng retry. Có nút thử lại có giới hạn cho trạng thái blocked.

## Event → query → REST

Parser Zod kiểm tra schemaVersion 1, UUID/version/timestamp/context nullable, ORDER changes/status và QR changeKind/entryType. Bỏ JSON sai, type/schema chưa hỗ trợ; bỏ field bổ sung để tương thích. Body tối đa 64 KiB ký tự, tối đa 1.000 item IDs/list và 9 ORDER changes. Không log/persist raw payload. Version thuộc đúng resource, không có global cursor hoặc delta API.

| Hint                         | Query key factory                                        | REST snapshot                               |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------- |
| ORDER_CHANGED                | `orderKeys.lists(scope)`                                 | GET `/orders` với criteria hiện tại         |
| ORDER_CHANGED resourceId     | `orderKeys.detail(scope,id)` nếu đã có cache             | GET `/orders/{id}` nếu active               |
| ORDER_CHANGED                | `orderKeys.tables(scope)`, `selectedTables(scope)`       | GET `/tables` / bàn đang chọn               |
| ORDER_CHANGED tableSessionId | `orderKeys.active(scope,id)`, `session(scope,id)`        | GET active-order / session liên quan        |
| ORDER ảnh hưởng QR review    | `qrReviewKeys.detail(scope,id)` liên quan context        | GET review và hash mới                      |
| QR_ORDER_REQUEST_CHANGED     | `qrReviewKeys.lists(scope)`                              | GET `/qr-order-requests`; badge lấy từ REST |
| QR resourceId / tableId      | `qrReviewKeys.detail`, `qrReviewKeys.table` nếu đã cache | GET detail / nhãn bàn                       |
| ORDER trên kitchen channel   | `orderKeys.kitchens(scope)`                              | GET `/kitchen/items`; không GET full order  |

ORDER items added vẫn refresh dù status không đổi. Cancel/complete làm list đọc lại từ REST, không tự chèn/xóa row theo suy đoán event. QR approval không tự dựng Order từ payload QR; backend phát ORDER fact riêng. Review TABLE chưa có session được đánh dấu cần kiểm tra vì có thể vừa xuất hiện phiên mới; không quét GET từng bàn để tìm mapping.

Mỗi consumer/channel có EventCache riêng theo scope, TTL 120s, capacity 1.000. Cùng eventId fan-out orders/kitchen vẫn đi đủ adapter; notification có cache riêng. Không so highestVersion giữa các tài nguyên hoặc channel.

Query invalidation gộp 350ms (constructor cho phép cấu hình), một timer/runtime. Tập key chờ tối đa 256 trước khi chuyển sang invalidate scope nghiệp vụ liên quan; các GET đang chạy được ghi dirty, không cancel/restart theo frame. Khi GET kết thúc sẽ có một lượt bổ sung nếu còn dirty. Query inactive chỉ stale, không tạo/fetch detail chưa mở. Không N+1 active-order theo mọi bàn; chỉ session từ hint. Query access failure không tự refetch vô hạn. Observer giữ nguyên page/filter/search, dữ liệu cũ và modal trong lúc tải.

Reconnect hoặc resume refetch các snapshot đang active và đánh stale cache liên quan; không phát lại notification từ GET. Chuyển route con cashier không reconnect. Tab ẩn giữ kết nối tối đa hai phút rồi đóng; trở lại luôn resync/revalidate. Nếu ẩn hơn 30s, thay transport để loại socket sống giả sau sleep; focus ngắn không liên tục đóng/mở. `navigator.onLine` chỉ là tín hiệu browser, không chứng minh backend sống.

QR polling đối soát: 60 giây khi STOMP connected và không có lỗi channel, 10 giây khi tắt/gián đoạn; không poll background, dừng khi query lỗi. Khi connected, QR query không thêm refetch-on-focus vì runtime điều phối resume. Không tạo bộ polling cho mọi query trong nền.

## Giữ an toàn form và mutation

Server state ở TanStack Query; draft/intent tiếp tục ở Zustand hoặc state form hiện có. Adapter không gọi unlockOrder/verifyOrder/clearAppend, không xóa uncertain/refusal hoặc coi POST đã thành công. Detail đang busy/uncertain/refused được giữ dirty và refetch sau khi ổn định; luồng verification/idempotent replay hiện có vẫn quyết định kết quả.

`useOrderDetail` dùng version guard cho cả trang và `OrderDetailModal`; `OrderPanel` quan sát cùng cache, kể cả kết quả POS. `useOrderBaseline` giữ baseline của form gọi thêm/editor/payment: event dirty hoặc snapshot/version mới chặn command mới, giữ input và yêu cầu **Kiểm tra lại**. Chỉ thao tác review tường minh nhận baseline mới; không tự đổi expectedVersion rồi retry. Command guard cũng kiểm tra cache dirty/version. Đơn terminal không gọi thêm và không tạo order khác để né conflict.

QR form chỉ key theo requestId, không remount theo hash. Giữ lý do từ chối và baseline đã xem; revision remote hoặc hash/version khác yêu cầu **Đọc lại yêu cầu**, bỏ xác nhận nhóm cũ. Hook quyết định kiểm tra lại cache dirty/hash/version trước REST. Event trong khi approve/reject chạy không tự đóng dialog hoặc suy thành công; response REST quyết định. Expiry vẫn tính từ expiresAt, không chờ event EXPIRED.

Payment giữ tiền khách đưa, phương thức, mã tham chiếu và intent/idempotency khi snapshot đổi. Cần review lại order/số tiền trước command mới; uncertain replay giữ nguyên request gốc. Không tự ghi/confirm payment hoặc complete từ socket. Modal focus trap chỉ setup theo vòng đời modal, tránh mất focus mỗi lần refetch/input đổi. Quyền payment tiếp tục qua `canPayment`.

Không thêm bước tạo DRAFT: `submissionMode:SUBMIT` vẫn tạo và xác nhận trong một REST request. QR khách vẫn chờ duyệt. Gọi thêm giữ cùng order, một serving order/phiên, các quy tắc expectedVersion/idempotency, mark-served/payment/complete/đóng phiên giữ ở REST/backend.

Toast chỉ cho QR CREATED/PENDING thực sự, không bịa tên bàn/khách, không auto navigate. Chưa phát âm thanh hoặc thông báo món mới vì chưa có KDS consumer sản phẩm. READY/SERVED/COMPLETED không phát toast món mới. Không Browser Notification permission, Web Push hoặc Service Worker mới.

## Kiểm thử và chạy thử

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Trên shell khác có thể dùng `npm`. Unit/component test chỉ dùng fake transport, Vitest/RTL/MSW, không kết nối backend thật. `realtimeCore.test.ts` kiểm contract, policy, teardown/retry, dedupe/debounce/fan-out và GET race. `staffRealtime.test.tsx` kiểm StrictMode/routing/auth, UI/intent safety và adapter với REST giả. Bộ regression cũ vẫn chạy nguyên trạng.

Manual cần backend test có Origin web được cho phép, subscription active và dữ liệu món/bàn/kho hợp lệ. Mở DevTools Network → WS: một socket `/ws`, CONNECT token hiện hành, hai subscription orders/QR khi đủ quyền. Không chụp/chia sẻ frame chứa bearer.

| Kịch bản                   | Thao tác và kết quả cần kiểm tra                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A — QR mới                 | Mở cashier + QR khách, gửi request. Badge/toast/backlog cập nhật qua REST; chưa tạo order hoặc báo bếp trước duyệt.                          |
| B — Duyệt từ thiết bị khác | Approve trên app khác. Pending rời backlog, detail mở hiện trạng thái mới/yêu cầu kiểm tra lại; bàn/order tải qua REST.                      |
| C — Gọi thêm               | Giữ giỏ gọi thêm trên web, append từ thiết bị khác. Cùng order cập nhật dòng/tổng tiền, giỏ web còn nguyên và cần review.                    |
| D — Ready/served           | Bếp đổi trạng thái/bulk ready/served. Detail cập nhật, không toast món mới.                                                                  |
| E — Complete               | Complete/đóng phiên ở thiết bị khác. Active list loại order sau GET, bàn/session/active-order liên quan stale/refetch.                       |
| F — Mạng/sleep             | Offline rồi online, ẩn tab/quay lại. Một socket tối đa, snapshot refetch, không phát lại notification lịch sử. Kiểm cả tab ẩn hơn hai phút.  |
| G — Đổi phiên              | Logout, đăng nhập lại cùng tài khoản rồi tài khoản khác. Không nhận callback/cache cũ. Token refresh không xóa draft nếu scope không đổi.    |
| H — Public isolation       | Từng đăng nhập staff rồi mở QR/menu/receipt public. Không staff WS, refresh/auth-me/entitlement do realtime. Giỏ/receipt polling giữ nguyên. |
| I — Payment                | Nhập tiền/mã tham chiếu rồi nhận event đổi tổng tiền. Input/focus giữ, confirm bị chặn đến khi review; không tự thu tiền/complete.           |

Kiểm thêm thu hồi ORDER_VIEW/feature và lỗi giới hạn nhiều tab: channel bị từ chối không retry vô hạn, kitchen độc lập nếu đủ quyền, REST 401/403 vẫn áp dụng. Kiểm mutation uncertain khi ngắt response POST: event không xóa key gốc hoặc tự retry POST/PATCH.

## Giới hạn

Backend hiện best-effort, single-instance, in-memory fan-out; không replay/exactly-once/outbox. Có thể mất event khi transport/queue lỗi, nên cần REST đối soát, resume/reconnect và nút tải lại hiện có. Không chia sẻ socket giữa nhiều tab, không SharedWorker/BroadcastChannel.

KDS web vẫn placeholder; adapter/policy/query prefix đã sẵn để consumer tương lai dùng `kitchenApi.items`. Không subscribe inventory khi chưa có consumer cảnh báo kho. Không xây màn mới trong phạm vi này.

Chưa có event riêng cho payment độc lập, mọi thao tác chuyển bàn, menu availability, guest receipt hoặc admin subscription/package. Không bảo đảm các màn đó tự cập nhật chỉ nhờ ORDER event; tiếp tục invalidate từ mutation REST/lifecycle hoặc polling hiện có. Chưa chạy các kịch bản hai thiết bị với backend thật trong bộ unit/component test.

Tham khảo: [STOMP.js usage](https://stomp-js.github.io/guide/stompjs/using-stompjs-v5.html), backend `docs/realtime-api.md`, `docs/order-realtime-api.md`, `docs/inventory-alert-realtime.md`.

## Kết quả xác minh

- Format: chỉ các file thay đổi bằng Prettier.
- `npm run lint`: đạt; còn warning có sẵn `itemsCalls` không dùng tại `src/test/qrMenu.test.tsx:324` (đối chiếu HEAD).
- `npm test -- --maxWorkers=2`: 29 file, 379 test đạt; gồm 80 test realtime mới và 299 regression.
- `npm run build`: đạt; Vite còn cảnh báo chunk lớn hơn 500 kB và authStore có cả dynamic/static import.
- `git diff --check`: đạt. Không sửa test regression cũ; chưa kiểm thử hai thiết bị/backend thật.

## Danh sách file thêm/sửa

Thêm:

- `docs/staff-realtime.md`
- `src/features/kitchen/realtime/kitchenAdapter.ts`
- `src/features/order/api/orderSnapshot.ts`
- `src/features/order/hooks/useOrderBaseline.ts`
- `src/features/order/realtime/orderAdapter.ts`
- `src/features/qr-order-review/realtime/qrReviewAdapter.ts`
- `src/portals/cashier/realtime.css`
- `src/portals/cashier/RealtimeIndicator.tsx`
- `src/portals/cashier/StaffRealtimeBoundary.tsx`
- `src/portals/cashier/staffRealtimeRuntime.ts`
- `src/shared/realtime/channelPolicy.ts`
- `src/shared/realtime/eventCache.ts`
- `src/shared/realtime/events.ts`
- `src/shared/realtime/queryInvalidator.ts`
- `src/shared/realtime/RealtimeContext.ts`
- `src/shared/realtime/runtime.ts`
- `src/shared/realtime/url.ts`
- `src/shared/realtime/useRemoteRevision.ts`
- `src/test/realtimeCore.test.ts`
- `src/test/realtimeFixtures.ts`
- `src/test/staffRealtime.test.tsx`

Sửa:

- `.env.example`
- `package.json`
- `package-lock.json`
- `README.md`
- `src/App.tsx`
- `src/features/auth/store/authStore.ts`
- `src/features/order/api/orderKeys.ts`
- `src/features/order/components/OrderAddItems.tsx`
- `src/features/order/components/OrderDetailModal.tsx`
- `src/features/order/components/OrderEditor.tsx`
- `src/features/order/components/OrderPanel.tsx`
- `src/features/order/hooks/useOrderDetail.ts`
- `src/features/order/hooks/useOrderMutations.ts`
- `src/features/order/hooks/useOrders.ts`
- `src/features/order/hooks/useOrderServiceContext.ts`
- `src/features/payment/components/PaymentModal.tsx`
- `src/features/qr-order-review/components/QrReviewModal.tsx`
- `src/features/qr-order-review/hooks/useQrReview.ts`
- `src/portals/cashier/CashierShell.tsx`
- `src/shared/api/httpClient.ts`
- `src/shared/api/tenantRequest.ts`
- `src/shared/components/AdminUi.tsx`
- `src/shared/config/env.ts`
