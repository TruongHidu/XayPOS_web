# Đồng bộ recipeEnabled và costConfigured — Phase 1

Web giữ React/TypeScript, Vite, React Router, TanStack Query, Zustand, Axios và Zod. Không thêm dependency, endpoint, mutation quản trị hoặc socket. Backend vẫn quyết định công thức, nguồn giá vốn, snapshot và allocation tại thời điểm chấp nhận món.

## Phạm vi thực tế

| Có trên web                                               | Tích hợp                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Chọn món private cho Cashier, tại bàn/mang đi, gọi thêm   | Schema menu nhận `costPrice`, `costConfigured`, `recipeEnabled`; cache menu có version mới |
| Tạo SUBMIT, gọi thêm, confirm theo luồng hiện có          | Thông báo lỗi công thức/kho; phân biệt rollback nghiệp vụ với conflict/kết quả chưa rõ     |
| Staff xem và duyệt QR                                     | Cùng error mapper; approve lỗi giữ request PENDING, input và yêu cầu đọc lại review        |
| Public menu/giỏ/receipt QR                                | Tiếp tục public DTO/API/guest authorization riêng, không thêm field nội bộ                 |
| Chi tiết, phục vụ, thanh toán, complete và staff realtime | Giữ contract/quyền/luồng hiện có                                                           |

Repo hiện chỉ có private menu GET list/groups để chọn món. Chưa có client/form tạo hoặc sửa menu item/ingredient, công thức, công tắc áp dụng, cost-estimate, protected recipe snapshot hoặc allocation. Vì vậy không thêm DTO/API/màn hình chưa có consumer. Các yêu cầu POST/PATCH clear/confirm cost, toggle permission và hiển thị metadata snapshot legacy thuộc phần không áp dụng trong lượt này.

Đã đối chiếu `MenuItemResponse`, `IngredientResponse`, `MenuItemController`, OpenAPI tenant/order và tài liệu Phase 1 backend. Các đoạn cũ nói không có active recipe thì luôn chốt NO_RECIPE được hiểu theo Phase 1 mới: món đang bật, có entitlement và thiếu active recipe phải bị từ chối bằng ACTIVE_RECIPE_REQUIRED. Web không tự fallback sang MANUAL.

## DTO và cache

`src/features/menu/schemas.ts` kiểm tra bắt buộc:

- `costPrice`: số không âm theo money schema hiện có; đây là giá tham chiếu nhập tay của món.
- `costConfigured`: boolean do backend trả về; không suy từ giá.
- `recipeEnabled`: boolean do backend trả về; không suy từ việc có công thức.

| Giá và cờ                             | Ý nghĩa                        |
| ------------------------------------- | ------------------------------ |
| `costPrice=0`, `costConfigured=false` | Chưa cấu hình/xác nhận giá     |
| `costPrice=0`, `costConfigured=true`  | Giá 0 đã được cấu hình rõ ràng |
| `costPrice>0`, `costConfigured=true`  | Đã cấu hình giá tham chiếu     |

Không lấy `costPerYieldUnit` hoặc giá bán để thay costPrice. costConfigured của món chỉ mô tả giá nhập tay; không khẳng định mọi nguyên liệu đã có giá. Picker vẫn dùng sellable/availability, quyền và feature hiện có; thiếu cấu hình giá vốn không khóa bán. Giao diện Cashier không thêm phần cấu hình giá vốn.

Menu dùng key từ `orderKeys.menu(scope, criteria)`:

```text
Trước: ['cashier', scope, 'menu', criteria]
Sau:   ['cashier', scope, 'menu', 'recipe-cost-v1', criteria]
```

Cache cũ không được dùng cho query mới, kể cả khi còn fresh. Query mới GET và parse DTO hiện hành. `orderKeys.menus(scope)` giữ prefix để invalidate menu trong đúng scope, bao gồm cả key cũ nếu còn trong memory; không clear toàn app/admin/public hoặc fetch toàn bộ trang.

Không có persisted private-menu query cache hoặc serializer menu trên web. Với draft giữ trong memory/HMR, các món đã chọn tiếp tục là lựa chọn của khách, không phải quyết định công thức. Request builder chỉ lấy ID/số lượng/ghi chú nên draft cũ thiếu cờ không bị điền false, không ghi ngược cấu hình. Lần chấp nhận vẫn do backend quyết định. Response private mới thiếu hoặc sai kiểu field bị báo INVALID_TENANT_RESPONSE; không bỏ schema validation hoặc mặc định giá 0 đã xác nhận. Cần triển khai web cùng backend Phase 1 đã cập nhật.

Snapshot ORDER/QR thường vẫn parse như trước và giữ identity theo `orderItemId`. Web không gọi protected snapshot/allocation cho mọi order, không suy MANUAL/RECIPE từ cấu hình menu hiện tại. Backend giữ metadata legacy nullable; do web chưa có màn đọc endpoint đó, không tạo metadata giả hoặc backfill lịch sử.

## Command và idempotency

Không đổi URL hoặc payload ORDER/QR. Tạo mới vẫn `submissionMode:SUBMIT` trong một request; không thêm confirm phụ. Gọi thêm vẫn vào order hiện tại, dùng expectedVersion và idempotency intent hiện có. Approve QR vẫn dùng expectedRequestVersion/reviewContextHash/targetSessionId, không thêm approve phụ.

Dòng request chỉ gồm `itemId`, `quantity`, `note`; schema request giữ allowlist nghiêm ngặt. Không serialize MenuItem, recipeEnabled, costConfigured, costPrice, costSourceSnapshot, recipeEnabledSnapshot hoặc recipe usages. Không giữ/trừ/hoàn kho ở frontend. Không yêu cầu quyền recipe/inventory hoặc gọi cost-estimate để bán món.

Chọn vào giỏ, DRAFT và QR PENDING chưa chốt quyết định. Nếu app đổi công tắc/công thức trong khi giỏ web đang mở, backend xét cấu hình tại SUBMIT/confirm/accepted append/approve. Dòng đã chấp nhận giữ snapshot cũ; gọi lại cùng itemId tạo orderItemId mới và không merge các dòng lịch sử.

Timeout/network/5xx vẫn giữ payload/key/expectedVersion đã gửi. Replay có chủ ý dùng đúng intent đó dù menu hoặc order đã được refetch lên version mới. Không thay key hoặc body để né conflict khi chưa biết kết quả.

## Lỗi nghiệp vụ

Thông báo nằm tại `features/order/utils/orderErrors.ts`, tái sử dụng bởi OrderFeedback và QR review; không thêm toast riêng.

| Code                                                              | Hành vi                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ACTIVE_RECIPE_REQUIRED                                            | Giữ nội dung, nhờ quản lý kiểm tra active recipe; không tự tắt công tắc              |
| RECIPE_INGREDIENT_UNAVAILABLE                                     | Nhờ quản lý kiểm tra nguyên liệu                                                     |
| RECIPE_INGREDIENT_UNIT_MISMATCH                                   | Nhờ quản lý kiểm tra đơn vị nguyên liệu                                              |
| RECIPE_YIELD_UNIT_MISMATCH                                        | Nhờ quản lý kiểm tra đơn vị thành phẩm/món                                           |
| INSUFFICIENT_AVAILABLE_STOCK                                      | Giữ giỏ, tải lại thực đơn và nhờ quản lý kiểm tra/bổ sung tồn                        |
| INVENTORY_DEFAULT_WAREHOUSE_REQUIRED                              | Nhờ quản lý cấu hình kho mặc định                                                    |
| INVALID_RECIPE_SNAPSHOT_DATA / RECIPE_USAGE_QUANTITY_OUT_OF_RANGE | Giữ nội dung, kiểm tra cấu hình/số lượng với quản lý                                 |
| CONCURRENT_ORDER_UPDATE                                           | Giữ luồng conflict: tải lại đơn, đối chiếu trước intent mới                          |
| ORDER_ITEM_RECIPE_SNAPSHOT_CONFLICT                               | Thông báo dữ liệu đã chốt không nhất quán, tải lại/nhờ quản lý; không tự sửa lịch sử |

Chỉ các code acceptance đã biết với HTTP 409 được phân loại là từ chối đã rollback. Create giữ lines/metadata, không uncertain và bỏ intent đã bị từ chối để người dùng có thể sửa. Append giữ giỏ form, bỏ intent đã bị từ chối, không đánh uncertain cho lỗi này. Menu trong đúng scope được invalidate/refetch nếu có consumer; không gọi quản trị kho/công thức. Không bỏ riêng món lỗi hoặc báo thành công cả đơn.

Conflict version, snapshot conflict và lỗi chưa nhận diện giữ quy tắc kiểm tra hiện có; không coi mọi 409 là cùng một loại lỗi. Không thay xử lý 401/refresh/403 hoặc tenant isolation. Nếu mất kết nối trước khi xác nhận kết quả, vẫn giữ intent gốc.

Approve QR bị từ chối không chạy onSuccess hoặc tự coi request APPROVED. Detail/menu liên quan được đọc lại qua REST, form vẫn cần người dùng **Đọc lại yêu cầu** trước action tiếp theo; không tự nhận hash mới rồi approve lại. Lý do từ chối đang nhập được giữ. Không tự sửa giá/công thức/chuyển MANUAL để retry.

## Public QR và realtime

Public menu không cần và không giữ field private. Zod public DTO tiếp tục loại field ngoài schema, kể cả khi response vô tình có metadata nội bộ. Guest submit chỉ gửi input public qua publicHttpClient và X-QR-Guest-Token; không dùng staff bearer hoặc API private. Giỏ/receipt/session storage/polling giữ nguyên, khách vẫn chờ duyệt.

Phase 1 không có event mới. Runtime, subscriptions và ORDER/QR payload hiện có giữ nguyên. Chỉ dùng REST snapshot làm nguồn dữ liệu; không broadcast metadata công thức/giá vốn, không tạo thêm socket. Thay đổi menu trên app không được giả thành ORDER event; menu được đọc lại qua lifecycle/query hiện có hoặc sau lỗi nghiệp vụ. Xem [staff realtime](staff-realtime.md).

## Kiểm thử thủ công

Chuẩn bị backend Phase 1, món bán được và tài khoản Cashier có quyền ORDER/MENU đang dùng; cấu hình nguyên liệu/công thức/kho trên app hoặc công cụ quản lý hiện có.

1. Món có giá vốn chưa cấu hình hoặc giá 0 đã xác nhận đều chọn/bán được. Kiểm Network: GET private menu có đúng hai cờ, POST ORDER không có field private hoặc request cost-estimate.
2. Chọn món trên web rồi đổi recipeEnabled/công thức trên app. Gửi tại bàn và mang đi: chỉ một SUBMIT; kết quả theo cấu hình tại lúc backend nhận. Không có POST menu/ingredient/inventory từ Cashier.
3. Tạo điều kiện ACTIVE_RECIPE_REQUIRED hoặc sai nguyên liệu/đơn vị bằng dữ liệu test hợp lệ. Gửi bị từ chối, giỏ/ghi chú còn nguyên, thông báo rõ; không success giả hoặc tự chuyển MANUAL.
4. Thiếu kho mặc định hoặc thiếu available stock: create/append bị từ chối, còn giỏ để sửa. Sau quản lý xử lý, tải lại rồi chủ động gửi. Không có retry POST tự động.
5. Ngắt response create/append sau khi gửi. Kiểm tra lại bằng intent gốc: cùng key/body/expectedVersion, kể cả khi menu/order đã đổi. Không tạo thêm order/dòng chỉ vì reconnect.
6. Cùng một món đã gọi, đổi công thức rồi gọi thêm: dòng cũ giữ orderItemId/giá/tên; dòng mới ID khác. Web không merge theo itemId hoặc suy quyết định công thức từ menu.
7. Khách gửi QR: receipt PENDING, không có giá vốn/cờ/cost metadata trong UI hoặc public state. Staff approve thiếu kho/nguyên liệu vẫn PENDING; input lý do từ chối giữ, cần đọc lại trước action tiếp theo.
8. Mở lại picker với cache cũ hoặc sau deploy: key menu có version mới, response được parse lại, không mặc định recipeEnabled=false. Filter/search/page và draft đang nhập không bị reset vì đổi version cache.
9. Chạy hồi quy phục vụ, payment, complete/đóng phiên; login/refresh/logout; QR reload/persistence; realtime reconnect. Không cần API protected snapshot/allocation cho màn Cashier.

## File thay đổi và kiểm tra tự động

- `src/features/menu/schemas.ts`: thêm field response private, không thêm schema quản trị chưa sử dụng.
- `src/features/order/api/orderKeys.ts`: menu cache version và prefix invalidate.
- `src/features/order/utils/orderErrors.ts`: thông báo và phân loại acceptance rollback.
- `src/features/order/store/orderDraftStore.ts`: invalidate menu sau acceptance refusal, giữ draft.
- `src/features/order/hooks/useOrderMutations.ts`: không khóa uncertain nhầm với acceptance refusal; giữ conflict/replay hiện có.
- `src/features/qr-order-review/hooks/useQrReview.ts`: đọc lại detail/menu khi approve bị từ chối.
- `src/test/orderFixtures.ts`: fixture menu theo DTO backend mới.
- `src/test/menuRecipeCost.test.ts`: DTO/cache, error classification, public privacy và request allowlist.
- `src/test/recipeCostWorkflow.test.tsx`: create/append/QR workflow, cart/input/idempotency/identity safety.
- `README.md` và tài liệu này: phạm vi, tương thích, vận hành và manual scenarios.

Chạy `npm.cmd run lint`, `npx.cmd tsc -b`, `npm.cmd test -- --maxWorkers=2`, `npm.cmd run build` trên Windows; shell hỗ trợ npm trực tiếp có thể bỏ `.cmd`. Chỉ format file thay đổi. Test dùng Vitest/RTL/MSW, không kết nối backend thật.

Kết quả xác minh ngày 27/10/2026:

- Prettier chỉ file thay đổi và `git diff --check`: đạt.
- `npm run lint`: đạt, còn warning có sẵn `itemsCalls` ở `src/test/qrMenu.test.tsx:324`.
- Typecheck `npx tsc -b`: đạt; production build cũng chạy TypeScript thành công.
- `npm test -- --maxWorkers=2`: **31 file / 447 test đạt**, gồm 68 test mới và 379 regression.
- `npm run build`: đạt; Vite còn cảnh báo chunk lớn hơn 500 kB và authStore có cả dynamic/static import.
- `npm run lint:eslint` toàn repo: còn 3 lỗi có sẵn — `any` tại `src/test/orderBulkAndCompletion.test.tsx:416,427` và biến không dùng tại `src/test/qrMenu.test.tsx:324`. Hai file này không đổi so với HEAD (`git diff --quiet HEAD -- ...` trả 0); không tắt rule hoặc sửa test để né kiểm tra.
- ESLint trên toàn bộ file TypeScript/TSX thay đổi: đạt.

Kịch bản app/backend thật ở phần manual chưa chạy trong lượt này. Không thêm dependency, không sửa backend hoặc commit/reset Git.

Giới hạn: không thêm snapshot tiền giá vốn, profit report, cost-estimate hoặc form quản lý. Các kịch bản với app/backend thật cần xác minh riêng trên môi trường test; test frontend mô phỏng contract và rollback qua MSW.

Nguồn đối chiếu trong backend: `recipe-application-and-cost-config-api.md`, `recipe-application-and-cost-config-fe-sync.md`, `order-api.md`, `order-recipe-snapshot-api.md`, `order-inventory-allocation-api.md`, `public-qr-order-api.md`, `order-realtime-api.md`, `openapi/tenant-api.yaml`, `openapi/order-api.yaml` và DTO/controller hiện hành.
