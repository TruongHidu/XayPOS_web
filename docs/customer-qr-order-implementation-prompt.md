# Prompt triển khai giao diện khách gọi món qua QR

Hãy tiếp tục triển khai giao diện khách hàng của dự án POS SaaS hiện tại: khách xem menu, chọn món, gửi yêu cầu chờ nhân viên duyệt và theo dõi kết quả. Hỗ trợ cả QR tại bàn và link menu nhà hàng dành cho mang đi. Viết mã hoạt động với API thật, tuân thủ cấu trúc dự án, giữ các thay đổi đang có của người dùng và kiểm tra kết quả trước khi bàn giao.

## 1. Phạm vi và nguồn contract

Hai cửa vào dùng chung nghiệp vụ gửi yêu cầu:

| Cửa vào                  | Loại yêu cầu          | Nguồn đơn sau khi duyệt                                     |
| ------------------------ | --------------------- | ----------------------------------------------------------- |
| QR bàn, qrToken          | TABLE / DINE_IN       | QR_TABLE; tạo mới hoặc thêm vào đơn đang phục vụ phù hợp    |
| Menu nhà hàng, menuToken | RESTAURANT / TAKEAWAY | QR_STATIC; mỗi request được duyệt tạo một đơn mang đi riêng |

Phạm vi UI: menu, chi tiết món, giỏ, thông tin khách, gửi yêu cầu, xem các yêu cầu đã biết của guest hiện tại và receipt của từng yêu cầu. Khách không đăng nhập tài khoản nhân viên, không tự chọn bàn/phiên từ danh sách, không duyệt yêu cầu hoặc thanh toán.

Yêu cầu bổ sung mới nhất: reload trong cùng tab phải khôi phục yêu cầu của chính guest ban đầu bằng `sessionStorage`. Yêu cầu này thay thế chính sách memory-only trong phiên bản prompt trước; không cấp guest mới để giả khôi phục yêu cầu cũ và không tự gửi món sau reload.

Đọc tài liệu API người dùng cung cấp. Nếu backend có trong `../pos-saas-be`, đối chiếu thêm:

- `docs/public-qr-order-api.md`, `docs/qr-order-fe-sync.md`, `docs/openapi/public-qr-order-api.yaml`.
- `docs/public-qr-menu-api.md`, `docs/public-restaurant-menu-api.md` và DTO/controller tương ứng.

Phân biệt API public của khách với `/qr-order-requests` dành cho nhân viên. Các hướng dẫn Postman đăng nhập/duyệt trong tài liệu chỉ mô tả phần nhân viên của nghiệp vụ; không đưa chúng vào giao diện public. Luồng Cashier gọi món/thanh toán đang có vẫn giữ nguyên.

Không thêm tính năng ngoài contract: khách sửa/hủy request đã gửi, đọc toàn bộ bill bàn, thanh toán, hoàn tiền, mở/đóng/chuyển phiên, approve/reject hoặc thao tác bếp. Không tạo API giả, mock production hoặc tự sửa feature/package/subscription để vượt điều kiện gọi món.

## 2. Tuân thủ cấu trúc và mã hiện tại

Stack: React 19 + TypeScript + Vite, React Router, TanStack Query, Axios, Zustand, React Hook Form, Zod, CSS/Tailwind hiện có. Không thêm UI framework, đổi state management, router hoặc cấu trúc toàn bộ ứng dụng.

Khảo sát trước khi sửa:

- `src/App.tsx`: `/qr/:qrToken` hiện nằm ngoài AuthBootstrap và private route guards.
- `src/portals/qr-menu/QrMenuLayout.tsx`: QueryClient riêng, tách khỏi cache nhân viên.
- `src/portals/qr-menu/QrMenuPage.tsx`: ghép menu TABLE/RESTAURANT, giỏ và lịch sử yêu cầu của khách.
- `src/features/qr-menu/{api,hooks,components,utils}`, `schemas.ts`, `types.ts`, `qr-menu.css`.
- `src/features/qr-order/{api,hooks,store,storage,components}`, `schemas.ts`, `types.ts` và các test QR-order hiện có.
- `src/shared/api/publicHttpClient.ts`: publicApi không Authorization, không refresh, withCredentials=false.
- `src/shared/utils/scaledDecimal.ts`, `src/shared/api/idempotency.ts`, `src/test/qrMenu.test.tsx`.

Mở rộng `features/qr-menu` cho menu TABLE/RESTAURANT; tạo `src/features/qr-order` cho nghiệp vụ mới. Không đặt guest cart/receipt vào `features/order` hoặc dùng `useOrderDraftStore` của thu ngân. Có thể dùng tiện ích thuần không phụ thuộc auth từ shared, nhưng không import private hooks/client/store/policy để gọi API khách.

Cấu trúc khuyến nghị, điều chỉnh tên theo quy ước thực tế nếu đã có module tương đương:

```text
src/features/qr-order/
  api/
    publicQrOrderApi.ts       # guest-access, create request, GET receipt
    publicQrOrderKeys.ts      # query keys theo entry, guest scope, requestId
  schemas.ts                 # Zod input và response
  types.ts                   # DTO/domain types, ưu tiên infer từ schema
  policies/
    qrOrderPolicy.ts          # validate giỏ, điều kiện intent mới, trạng thái receipt
  hooks/
    useQrGuestAccess.ts       # cấp guest access khi có hành động, single-flight
    useQrOrderSubmit.ts       # tạo và retry frozen intent
    useQrOrderReceipt.ts      # GET/poll receipt bằng guest đã gửi
    useQrOrderNavigationGuard.ts
  store/
    qrOrderGuestStore.ts      # guest, entry scope, epoch, các requestId đã biết
    qrOrderDraftStore.ts      # giỏ local và frozen submission riêng cho khách
  storage/
    qrOrderSessionStorage.ts  # snapshot theo backend/entry, validate và xử lý lỗi storage
  components/
    QrOrderRuntimeBoundary.tsx
    QrOrderCart.tsx
    QrOrderLineEditor.tsx
    QrOrderCustomerForm.tsx
    QrOrderReceipt.tsx
    QrOrderFeedback.tsx
  utils/
    qrOrderErrors.ts
  qr-order.css

src/portals/qr-menu/
  QrMenuPage.tsx              # ghép menu + giỏ theo entry
  QrRequestPage.tsx           # ghép trang theo dõi receipt
```

- API module chịu trách nhiệm HTTP, headers, encode path và parse response; component không gọi Axios trực tiếp.
- Hook quản lý query/mutation và invalidation; policy là hàm thuần; store chỉ giữ guest identity, giỏ, intent và requestId đã biết. Receipt/server state thuộc TanStack Query, không nhân bản toàn bộ vào Zustand.
- Giữ các component menu và tên export đang có nếu có thể; khi đổi signature phải cập nhật các caller/test liên quan. Không nhân đôi một bộ menu riêng cho mang đi.
- CSS có scope `.qr-menu-*`/`.qr-order-*`, không sửa selector toàn cục gây ảnh hưởng admin hoặc cashier. Modal public phải có focus trap, Escape, trả focus và khóa đóng phù hợp khi đang gửi.

## 3. Routes và hai loại entry

Giữ `/qr/:qrToken`; bổ sung route public `/menu/:menuToken` nếu dự án chưa có route tương đương. Cả hai nằm dưới QrMenuLayout và ngoài AuthBootstrap/RequireAuth/RequireTenant/OrderRuntimeBoundary của nhân viên.

Trang receipt gắn với đúng cửa vào:

- `/qr/:qrToken/requests/:requestId`.
- `/menu/:menuToken/requests/:requestId`.

Đây là route frontend, không phải endpoint backend mới. requestId là UUID yêu cầu, không phải orderId. Không đưa guestToken vào URL, query string hoặc fragment; không dẫn receipt sang `/cashier/orders/...`.

Dùng entry được định kiểu, ví dụ `{ entryType: 'TABLE' | 'RESTAURANT', token: string }`; route quyết định entryType và token URL. Không suy entry từ việc chuỗi token trông giống nhau, không dùng qrToken thay cho menuToken hoặc ngược lại. QR/menu token là opaque và phân biệt hoa/thường; không lowercase chúng. Validate định dạng theo backend trước request; định dạng QR bàn hiện tại là base64url 43 ký tự. requestId validate UUID.

Header nhận table tùy entry: TABLE hiển thị tên/mã bàn; RESTAURANT hiển thị “Đặt món mang đi”, không dựng bàn hoặc session giả. Menu RESTAURANT context không có property table; guest-access RESTAURANT có table=null. Schema cần phân biệt đúng hai response đó.

Query keys menu có entryType + token + filter; query receipt có guest scope riêng + requestId. Không dùng guestToken thô làm query-key identifier mới; dùng scopeId/epoch trong memory. A → B → A tạo runtime scope mới; guest ban đầu của A có thể khôi phục từ snapshot hợp lệ của A, nhưng response của scope A cũ không được cập nhật scope A mới.

## 4. Giao diện cho khách

### Menu và chọn món

- Ưu tiên điện thoại 360–430px; tận dụng phong cách và component QR menu đang có. Desktop hiển thị menu trái và giỏ phải; mobile dùng giỏ dạng trang/panel hoặc bottom sheet.
- Header gồm tên nhà hàng, bàn hoặc nhãn mang đi. Điều hướng “Thực đơn”, “Giỏ món”, “Yêu cầu của bạn” rõ ràng. Nút chạm tối thiểu khoảng 44px; có khoảng đệm safe-area để thanh giỏ không che món.
- Giữ tìm kiếm debounce khoảng 300ms, chip nhóm, sort name/salePrice, pagination. Đổi nhóm/search reset page; chuyển entry reset filter và state đúng scope.
- Card ảnh món, tên, đơn vị và giá; chi tiết món có mô tả, số lượng, ghi chú và nút “Thêm vào giỏ”. Ảnh thiếu/lỗi dùng fallback hiện có, không phát request vô hạn hoặc lấy ảnh mẫu làm dữ liệu thật.
- OUT_OF_STOCK vẫn hiển thị với nhãn “Hết món”; cho xem chi tiết nhưng khóa thêm/gửi món đó. AVAILABLE có thể hết sau khi khách chọn, backend vẫn kiểm tra lại.
- Xử lý nhóm/menu rỗng, không có kết quả tìm kiếm, món không có group/description/imageUrl, loading/error/retry. Giữ giới hạn recovery nhóm và page overshoot của menu hiện tại, tránh retry-loop.
- Xem menu chỉ cần GET, không cấp guest, không yêu cầu đăng nhập/PIN và không cần có phiên bàn. Cho khách đọc menu khi chức năng gọi món chưa được nhà hàng bật.

### Giỏ và thông tin khách

- Giỏ gồm tên món, số lượng, đơn vị, giá dự kiến, ghi chú dòng, sửa/xóa trước khi gửi. Cùng món khác ghi chú là các dòng riêng; không tự gộp hoặc đổi thứ tự các dòng trong intent đã chốt.
- Nút +/- tiện thao tác, đồng thời validate được số lượng thập phân theo contract. Mặc định 1; không âm thầm làm tròn quantity về số nguyên.
- Tên và điện thoại tùy chọn tại bàn. Mang đi bắt buộc tên nhận hàng đã trim, điện thoại tùy chọn; không ép phone bắt buộc hoặc format ngoài contract.
- Ghi chú chung tối đa 500 ký tự; ghi chú món tối đa 500; tên tối đa 100; phone tối đa 30. Hiển thị lỗi tại trường nhập.
- Giới hạn 1–20 dòng, quantity >0 và <=20, tối đa 3 chữ số thập phân; không dùng giới hạn giỏ thu ngân 100 dòng/ghi chú 2000 ký tự. Parse quantity hợp lệ rồi mới serialize JSON number, không gửi chuỗi.
- Tổng ghi “Tổng dự kiến”, kèm “Nhà hàng sẽ kiểm tra và xác nhận yêu cầu”. Tiền tính qua scaledDecimal/BigInt hiện có; preview HALF_UP đúng precision. Không nhân cộng floating point để làm tổng chính thức.
- Nút “Gửi yêu cầu gọi món” khóa khi giỏ rỗng, dữ liệu sai, món đã biết hết hàng, guest đã hết hạn/thu hồi, cooldown hoặc đang gửi. Guest chưa từng được cấp là trạng thái hợp lệ cho lần gửi đầu: cho nhấn nút để cấp access rồi gửi. Không khóa nút chỉ vì chưa có guestToken. Có pending rõ ràng và khóa double click.
- Giữ giỏ khi đóng panel/tìm món/đổi nhóm trong cùng entry. Đổi bàn/nhà hàng có cảnh báo giỏ chưa gửi và reset scope; không tự mang giỏ sang nhà hàng khác.

### Gửi thành công và receipt

- POST thành công chuyển đến requestId server trả về. Hiển thị theo status thực tế của response, không tự ép PENDING; replay có thể đã APPROVED/REJECTED/CANCELLED.
- PENDING chưa hết hạn: “Đang chờ nhà hàng xác nhận”. Giỏ local được tách khỏi receipt đã gửi; receipt chỉ đọc. Không dùng thông báo “Đã vào bếp”, “Đã tính vào hóa đơn” hoặc “Bàn đã được mở”.
- APPROVED: “Nhà hàng đã nhận yêu cầu”, mã đơn chứa các món, approvedAmount và các trạng thái món riêng của yêu cầu. Giá chốt có thể khác estimatedAmount; hiển thị chênh lệch rõ ràng mà không sửa snapshot dự kiến.
- REJECTED: thông báo chung “Nhà hàng chưa thể nhận yêu cầu này. Vui lòng liên hệ nhân viên.” Receipt public không có lý do từ chối, không dựng field/message từ API staff.
- CANCELLED: “Yêu cầu không còn hiệu lực”; không gắn nút hủy cho khách hoặc suy một lý do cụ thể nếu response không cung cấp.
- Chỉ hiển thị hết hạn chờ duyệt khi `status === 'PENDING' && expired === true`. APPROVED vẫn là đã duyệt dù expired=true. Hiển thị thời hạn từ expiresAt, không hardcode 15 phút hoặc 60 phút.
- “Yêu cầu của bạn” chỉ liệt kê requestId đã biết thuộc guest hiện tại, gồm ID đã gửi thành công hoặc đã GET thành công bằng token gốc. Khôi phục danh sách này sau reload cùng tab; backend tiếp tục kiểm tra quyền sở hữu mỗi receipt. Không có API lịch sử public toàn nhà hàng; không tự tạo GET list hoặc tìm các request của người khác.
- Tại bàn: “Gọi thêm” mở giỏ mới, cùng guest hợp lệ, key mới cho request mới; vẫn chờ nhân viên duyệt. Backend quyết định thêm vào order/phiên, khách không gửi target order/session.
- Mang đi: “Đặt thêm món” tạo request khác; thông báo mỗi yêu cầu được duyệt là một đơn mang đi riêng. Không tự gộp theo tên, phone hoặc guest.
- Receipt chỉ chứa món thuộc request này; không gọi số tiền đó là toàn bộ hóa đơn bàn, không cộng với các món của khách khác hoặc thêm nút thanh toán.

## 5. API public cần tích hợp

`env.apiBaseUrl` đã chứa `/api/v1`; publicApi gọi các path dưới đây, không lặp prefix. Accept JSON; POST có Content-Type application/json. Tất cả API này không có Authorization Bearer, không gọi auth refresh/me-entitlements và không gửi restaurantId.

| Method/path                                                  | Body/query                                                                | Kết quả                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------- |
| GET `/public/menu/tables/{qrToken}`                          | Không body                                                                | restaurant, table, groups                    |
| GET `/public/menu/tables/{qrToken}/items`                    | q, groupId, page, size, sortBy, direction                                 | Trang món                                    |
| GET `/public/menu/restaurants/{menuToken}`                   | Không body                                                                | restaurant, groups; không có table           |
| GET `/public/menu/restaurants/{menuToken}/items`             | Như menu bàn                                                              | Trang món                                    |
| POST `/public/qr-order/tables/{qrToken}/guest-access`        | Chính xác `{}`                                                            | 201 guest access TABLE                       |
| POST `/public/qr-order/restaurants/{menuToken}/guest-access` | Chính xác `{}`                                                            | 201 guest access RESTAURANT                  |
| POST `/public/qr-order/requests`                             | customerName/customerPhone/note/items; X-QR-Guest-Token + Idempotency-Key | 201 mới hoặc 200 replay, cùng receipt schema |
| GET `/public/qr-order/requests/{requestId}`                  | X-QR-Guest-Token, không body/key                                          | 200 receipt của guest đó                     |

Menu query: q<=100 ký tự, groupId UUID, page số nguyên >=0, size 1–100 mặc định 20, sortBy name/salePrice, direction asc/desc. Response phân trang là `{ content, page, size, totalElements, totalPages }`.

Payload gửi món chỉ cho phép:

```json
{
  "customerName": "Tên nhận hàng khi mang đi",
  "customerPhone": "0900000000",
  "note": "Ghi chú chung",
  "items": [{ "itemId": "<UUID món>", "quantity": 2, "note": "Không hành" }]
}
```

Tại bàn có thể bỏ customerName/customerPhone hoặc gửi null theo contract. Không gửi serviceType/sourceChannel/entryType/restaurantId/tableId/tableSessionId/orderId/expectedVersion/unitPrice/totalAmount/status. Backend xác định entry và service từ guestToken, tính giá và tạo request; chưa tạo order ở bước này.

Idempotency-Key dài 1–100 ký tự, đúng regex `^[A-Za-z0-9._:-]+$`; ưu tiên UUID v4 an toàn. Shared idempotencyHeaders hiện kiểm ký tự printable rộng hơn contract QR, nên thêm validation riêng cho QR, không nới contract hoặc sửa private client để dùng chung một cách sai.

## 6. DTO/schema response

Define Zod theo DTO đầy đủ, các field dưới đây required; field có thể null phải dùng nullable, không mặc định giả giá/status/version. Response lỗi parse là kết quả chưa xác minh, đặc biệt với POST; không coi là chưa gửi thành công.

```ts
type GuestAccess = {
  guestToken: string
  expiresAt: string
  entryType: 'TABLE' | 'RESTAURANT'
  serviceType: 'DINE_IN' | 'TAKEAWAY'
  sourceChannel: 'QR_TABLE' | 'QR_STATIC'
  restaurant: { id: string; name: string; currencyCode: string }
  table: { id: string; code: string; name: string } | null
}

type QrOrderReceipt = {
  requestId: string
  entryType: 'TABLE' | 'RESTAURANT'
  serviceType: 'DINE_IN' | 'TAKEAWAY'
  sourceChannel: 'QR_TABLE' | 'QR_STATIC'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  version: number
  expired: boolean
  currencyCode: string
  estimatedAmount: number
  approvedAmount: number | null
  approvedOrderCode: string | null
  createdAt: string
  expiresAt: string
  items: Array<{
    requestItemId: string
    itemId: string
    itemName: string
    unit: string
    quantity: number
    estimatedUnitPrice: number
    estimatedLineTotal: number
    note: string | null
    approvedOrderItemId: string | null
    approvedUnitPrice: number | null
    approvedLineTotal: number | null
    status: 'PENDING' | 'COOKING' | 'READY' | 'SERVED' | 'CANCELLED' | null
  }>
}
```

GuestAccess validate mapping TABLE/DINE_IN/QR_TABLE có table; RESTAURANT/TAKEAWAY/QR_STATIC có table=null. Receipt chỉ validate bộ entryType/serviceType/sourceChannel tương ứng, không yêu cầu field table. Validate UUID, số tiền/quantity finite đúng precision, timestamps ISO và version số nguyên an toàn không âm. Không decode guestToken như JWT.

Receipt không có customerName/customerPhone/note chung, rejectionReason, approvedOrderId, sessionId hoặc toàn bộ bill. Nếu cần hiển thị thông tin khách đã nhập, chỉ dùng bản local cùng scope và ghi đúng nguồn; không thêm field vào schema response hoặc suy ra từ orderCode.

Trước duyệt, giá/status approved của từng dòng đều có thể null. Sau duyệt cũng xử lý trường hợp giá/status dòng null; hiển thị thông tin chưa có thay vì lấy giá dự kiến làm giá chốt. estimatedAmount/estimatedLineTotal và approvedAmount/approvedLineTotal lấy từ response, không join menu mới để thay snapshot.

## 7. Guest identity, intent và lưu trữ

- Giữ nguyên publicApi: guest header đặt cho từng request QR-order, không ghi vào Axios defaults/global và không gửi guestToken vào các GET menu hoặc API staff.
- Cấp guest access khi khách chủ động bắt đầu gửi yêu cầu, sau khi giỏ hợp lệ; có thể hiển thị “Đang chuẩn bị gửi yêu cầu”. Dùng single-flight để double click/remount/StrictMode không tạo nhiều guest identity. Không mint trong mỗi render/refetch hoặc khi chỉ xem menu.
- Guest access thành công giữ GuestAccess gốc, expiresAt và requestId đã biết trong memory cùng `sessionStorage` riêng của public QR. Khóa lưu trữ có phiên bản, tách theo API backend + entryType + QR/menu token chính xác, phân biệt hoa thường. Không dùng kho token nhân viên. Guest hết hạn/thu hồi không được âm thầm thay bằng token khác rồi retry intent cũ; token mới là identity mới và không đọc được receipt của token cũ.
- Một frozen intent gồm entry scope/epoch, guest identity dùng để gửi, key, body đã chuẩn hóa và thứ tự các items. Normalize một lần, clone sâu/freeze trước POST; text khách đang sửa không được thay payload retry.
- State tối thiểu phân biệt editable, pending, unresolved, submitted và access-invalid/cooldown. POST retry=false; unknown outcome có action “Kiểm tra lại yêu cầu ban đầu”. Trong pending/unresolved khóa sửa, xóa, submit mới cho intent đó; không reset intent khi GET menu đổi giá/hết món.
- Trước khi POST, lưu frozen intent có key/body, dòng món rút gọn đủ hiển thị và thông tin khách trong body để reload cắt ngang phản hồi vẫn biết yêu cầu nào cần kiểm tra. Không lưu group/ảnh/mô tả menu. Kiểm tra quantity bằng quy tắc decimal hiện có và kiểm tra thứ tự/itemId/quantity/note của snapshot khớp body. Reload khôi phục intent thành unresolved, pending=false; khóa sửa và chỉ replay bằng thao tác rõ ràng của khách, đúng guest/key/body ban đầu.
- 201/200 hợp lệ mới đánh intent đã gửi; cập nhật requestId và xóa intent trong cùng snapshot. Xóa body/dòng món/thông tin khách tạm lưu sau thành công, xóa giỏ tương ứng trong memory; không xóa giỏ mới khác hoặc state của scope khác bằng response trễ.
- Timeout/network/5xx/malformed success: giữ guestToken/key/body; retry POST gốc. Nếu chưa có requestId, không đoán requestId hoặc GET lịch sử không tồn tại. GET receipt không tự chứng minh một intent khác đã gửi thành công.
- Known business rejection khi không còn outcome chưa rõ cho phép sửa giỏ sau khi hiển thị lỗi phù hợp; intent mới sau sửa có key mới. IDEMPOTENCY_KEY_REUSED không tự đổi key/gửi lại: khóa intent, giữ trạng thái khóa qua reload và hướng dẫn kiểm tra với nhân viên.
- Nếu guest invalid khi outcome cũ chưa rõ, báo cần kiểm tra với nhà hàng; không tự mint và gửi lại món vì có thể tạo yêu cầu trùng. Chỉ intent mới do khách chủ động xác nhận mới được dùng guest mới khi scope cho phép.
- Chính sách memory-only trước đây được thay thế theo yêu cầu mới của người dùng. Ngoài GuestAccess/requestId và intent tạm thời nêu trên, không persist giỏ chưa gửi nói chung, receipt hoàn chỉnh hoặc PII sau thành công. Không dùng localStorage, staff tokenStorage, URL, query string/fragment hoặc query key để lưu guest credential; không thêm Service Worker/offline queue.
- Runtime boundary giữ guest/intent khi chuyển menu/receipt cùng entry; đổi entry hoặc guest identity thì abort request, clear cache/state runtime liên quan và tăng epoch. Snapshot hợp lệ có thể khôi phục identity riêng khi quay lại entry, nhưng response trễ của runtime scope cũ không được cập nhật scope mới. Unmount public portal và staff logout không xóa dữ liệu QR trong sessionStorage. Khách chủ động xác nhận bắt đầu lượt mới thì xóa identity/danh sách ID/intent cũ của entry.
- Sau reload/direct link, đọc snapshot hợp lệ của đúng backend/entry trước khi GET receipt bằng guest gốc. Không tự mint hoặc POST; chỉ có link/requestId, cùng bàn/tên/số điện thoại không chứng minh quyền sở hữu. Không còn snapshot, đóng tab, xóa dữ liệu phiên, guest hết hạn hoặc bị thu hồi thì giải thích không khôi phục được quyền và cho quay lại menu/liên hệ nhân viên; không chuyển sang login/route staff. Giữ cảnh báo trước unload khi còn giỏ hoặc intent chưa rõ kết quả.
- Validate phiên bản, schema, kích thước, entry, guest mapping và body snapshot trước khi dùng; dữ liệu hỏng/sai scope/quá lớn được cô lập thành trạng thái không còn quyền, không mint thay thế âm thầm. Hết hạn/401 lưu trạng thái invalid và loại bỏ credential/intent khỏi storage. Catch lỗi getter/getItem/setItem/removeItem; lỗi storage không ném ra làm crash ứng dụng. Cảnh báo khi thực sự không lưu được rằng reload có thể mất quyền; không mặc định cảnh báo mọi khách.
- Không log token/key/customer body, không đưa vào analytics/crash report, không cache HTTP response no-store qua Service Worker/CDN. Giữ `referrerPolicy="no-referrer"` cho ảnh/liên kết ra ngoài; nếu có cấu hình hosting thì dùng Referrer-Policy tương ứng. Không thêm SDK bên thứ ba để theo dõi khách.

## 8. Theo dõi yêu cầu bằng polling

- TanStack Query GET receipt có AbortSignal, enabled khi có guest đúng scope và requestId hợp lệ. Không dùng private order detail để lấy trạng thái/giá/bill.
- PENDING chưa expired: polling khoảng 5–10 giây khi trang hiển thị, với backoff/jitter khi lỗi tạm. Cho “Làm mới” thủ công; không giả WebSocket/realtime hoặc tạo interval chồng nhau.
- APPROVED: tiếp tục polling thưa hơn để cập nhật item.status PENDING/COOKING/READY/SERVED/CANCELLED. Dừng khi mọi dòng có trạng thái terminal SERVED/CANCELLED; nếu status dòng còn null thì không tự kết luận đã giao xong.
- REJECTED/CANCELLED/PENDING+expired: dừng polling tự động. expired=true của APPROVED không phải điều kiện dừng theo deadline chờ duyệt; còn tùy dòng món và guest access.
- Tạm dừng khi document.hidden/offline/unmount, khôi phục bằng GET hợp lệ khi visible/online; tôn trọng guest expiresAt và HTTP 401. Không tự mint access mới khi refocus.
- Tôn trọng 429 Retry-After, cả dạng seconds và HTTP-date nếu trả về. Trong cooldown khóa gửi/làm mới, hiển thị thời gian chờ; không reset key/body hoặc mint guest để vượt rate limit.
- Không dùng receipt.version đơn thuần để bỏ response có version bằng nhau: version là phiên bản QR request, trạng thái món có thể đổi mà version request không tăng. Bảo vệ response trễ bằng scope/epoch, requestId, cancellation và thứ tự fetch phù hợp; không giữ mãi status món cũ vì cùng version.
- API/menu/network lỗi không được tự xóa receipt đã xác nhận. Hiển thị dữ liệu gần nhất với nhãn chưa cập nhật và nút làm mới khi phù hợp; không biến PENDING thành APPROVED bằng optimistic update.

## 9. Xử lý lỗi cụ thể

Map theo HTTP status và code, không so nội dung message. Lỗi menu nhà hàng dùng details; menu bàn/QR order dùng fieldErrors. Giữ hai dạng mà không làm hỏng mapper QR menu cũ.

| HTTP/code                                         | Hành vi UI                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 400 INVALID_REQUEST_BODY/VALIDATION_ERROR         | Lỗi trường nhập/query; không retry body sai                                             |
| 400 ORDER_AMOUNT_LIMIT_EXCEEDED                   | Giữ giỏ, yêu cầu giảm số lượng/điều chỉnh                                               |
| 401 QR_GUEST_ACCESS_INVALID                       | Dừng gửi/polling; access hết hạn/thu hồi, không staff refresh/login hoặc auto đổi guest |
| 403 QR_ORDER_UNAVAILABLE                          | Gọi món không khả dụng; vẫn cho xem menu nếu GET menu còn được phép                     |
| 403 QR_MENU_UNAVAILABLE/PUBLIC_MENU_UNAVAILABLE   | Menu không khả dụng, hướng dẫn liên hệ nhà hàng                                         |
| 404 QR_MENU_NOT_FOUND/PUBLIC_MENU_NOT_FOUND       | QR/link không khả dụng; không chuyển token sang cửa vào khác                            |
| 404 PUBLIC_MENU_GROUP_NOT_FOUND                   | Recovery filter/context có giới hạn như hiện tại                                        |
| 404 QR_ORDER_UNAVAILABLE                          | Entry/món không khả dụng; giữ giỏ, tải lại menu phù hợp                                 |
| 404 QR_ORDER_REQUEST_NOT_FOUND                    | Request không tồn tại/không thuộc guest; không tìm bằng guest khác                      |
| 409 ITEM_NOT_SELLABLE/ITEM_OUT_OF_STOCK           | Refetch menu, đánh dấu dòng cần sửa; không tự thay món hoặc bỏ món rồi gửi              |
| 409 QR_ORDER_CHECKOUT_IN_PROGRESS                 | Bàn/đơn đang checkout; báo không nhận thêm món, liên hệ nhân viên                       |
| 409 IDEMPOTENCY_KEY_REUSED                        | Giữ frozen intent, không sinh key/guest mới để gửi lại                                  |
| 409 CONCURRENT_QR_REQUEST_UPDATE                  | Đối chiếu request đã biết; giữ state, không auto gửi intent khác                        |
| 413 QR_REQUEST_BODY_TOO_LARGE                     | Khóa gửi body quá lớn, hướng dẫn giảm ghi chú/dòng                                      |
| 429 QR_RATE_LIMIT_EXCEEDED                        | Chờ Retry-After, tránh retry/mint loop                                                  |
| Network/timeout/5xx hoặc POST response sai schema | Unknown outcome: retry đúng guest/key/body gốc                                          |

Body POST giới hạn 32 KiB: kiểm bằng UTF-8 bytes của JSON body cuối cùng (`TextEncoder`), không đếm ký tự JavaScript. UUID/key/header cũng validate trước HTTP. Các lỗi schema nội bộ hiển thị thông báo dễ hiểu; không đổ stack/token/raw payload ra màn khách.

## 10. Feature và phụ thuộc nhân viên duyệt

| Nghiệp vụ                 | Feature phía nhà hàng                                               |
| ------------------------- | ------------------------------------------------------------------- |
| Xem menu TABLE/RESTAURANT | QR_MENU_VIEW                                                        |
| Gọi món TABLE             | QR_MENU_VIEW + QR_TABLE_ORDER + ORDER_MANAGEMENT + TABLE_MANAGEMENT |
| Gọi món RESTAURANT        | QR_MENU_VIEW + QR_STATIC_ORDER + ORDER_MANAGEMENT                   |

Khách không có permission của nhân viên. Backend quyết định entitlement từ subscription snapshot; menu context hiện không cung cấp feature flags để frontend tự suy ordering. Xử lý guest-access/order error đúng code, không gọi `/me/entitlements` hoặc suy từ tên Basic/Pro. POS_QUICK_ORDER thuộc luồng staff mang đi, không phải gate QR_STATIC.

Yêu cầu chờ duyệt chỉ vào order sau khi nhân viên review và approve qua luồng staff. Staff có thể tạo phiên tại bàn trống hoặc append vào đơn phù hợp; frontend khách không thao tác các bước này. Khi kiểm thử end-to-end cần một nhân viên/fixture staff duyệt request để khách thấy APPROVED. Nếu UI inbox nhân viên chưa có, báo phụ thuộc này riêng; không tự triển khai inbox ngoài phạm vi hoặc auto-approve từ phía khách.

## 11. Kiểm thử bắt buộc cho phần triển khai

Giữ các test QR menu đang có, bổ sung fixture/MSW chỉ trong test. Gợi ý file `src/test/qrOrderApi.test.ts`, `qrOrderStore.test.ts`, `qrOrderUi.test.tsx`, `qrOrderReload.test.tsx`; thêm hồi quy restaurant menu khi generalize adapter.

1. Hai entry gọi đúng menu/guest-access, không trộn token, table=null/absent xử lý đúng; route sai token/UUID không phát request.
2. Chỉ xem menu không POST guest/create; không auth refresh/me-entitlements/Authorization ngay cả trình duyệt có staff token; staff logout/cache.clear không xóa public state.
3. Chỉ thêm món AVAILABLE; giữ OUT_OF_STOCK trong menu; tên mang đi bắt buộc, tại bàn tùy chọn; quantity 0/âm/>20/quá 3 thập phân/chuỗi JSON sai bị chặn; note/tên/phone và 20 dòng đúng giới hạn.
4. API allowlist payload/header, {} guest-access, idempotency regex, 32KiB UTF-8, response nullable và malformed response.
5. Double click/StrictMode không tạo nhiều intent/guest. 201 và 200 replay cùng requestId; replay đã APPROVED không bị ép PENDING.
6. Network/5xx/timeout/parse error giữ nguyên guest/key/body/thứ tự dòng và khóa sửa. Menu refetch đổi giá/hết món không thay frozen body. IDEMPOTENCY_KEY_REUSED không auto key mới.
7. Guest invalid không mint mới/refresh staff/replay bằng identity khác. Reload TABLE/RESTAURANT giữ guest gốc và requestId, GET lại receipt mà không mint/POST. Đổi token/entryType/backend không trộn identity; A → B → A có thể khôi phục guest A trong scope mới nhưng bỏ response trễ của scope cũ. Request người khác bị backend từ chối và không thêm vào lịch sử. Hết hạn/thu hồi giữ invalid qua nhiều lần reload.
8. PENDING chỉ chờ duyệt; APPROVED hiển thị giá chốt/status dòng riêng; expired chỉ quyết định hết hạn khi PENDING; receipt không gọi private API/full bill hoặc dựng rejectionReason.
9. Polling/backoff/Retry-After/background/unmount/abort đúng; cùng receipt.version vẫn cập nhật status món; dừng theo trạng thái/guest hợp lệ mà không tự submit.
10. TABLE gọi thêm tạo request mới/key mới chờ staff, không gửi session/order target; TAKEAWAY request thứ hai độc lập; không có action khách approve/reject/sửa/hủy/thu tiền.
11. Privacy: chỉ giữ guest/requestId và intent tạm thời trong sessionStorage đúng scope, không localStorage/staff tokenStorage; không persist giỏ chưa gửi/receipt/PII sau thành công, không guest header trên menu hoặc private API; query/route không lộ guestToken. Reload khi POST pending hoặc unknown outcome chỉ cho replay thủ công cùng guest/key/body; conflict giữ khóa, thành công xóa body/dòng món/thông tin khách đã lưu. Storage bị chặn/hỏng/quá lớn không crash, không tự mint và có thông báo đúng trạng thái.
12. Hồi quy routes/auth/admin/cashier/menu cũ và modal focus/keyboard/empty/error.

Chạy lint các file đổi, `npm.cmd run lint`, `npm.cmd run lint:eslint`, `npm.cmd test -- --reporter=dot --maxWorkers=2`, `npm.cmd run build`. Khảo sát baseline hiện tại trước khi kết luận; không lấy lỗi/kết quả test của lần làm trước để báo kết quả lần này. Nếu công cụ trình duyệt có sẵn, kiểm tra 390/768/1366px, cuộn giỏ, focus, bàn phím mobile, text dài/ảnh lỗi và không tràn ngang. Không tự tạo data backend/nhà hàng thật để chạy test.

## 12. Tiêu chí nghiệm thu và bàn giao

- Giữ route/menu TABLE hiện có; RESTAURANT hoạt động cùng bộ component và public boundary.
- Khách dùng điện thoại chọn món, xem giỏ, nhập dữ liệu đúng và gửi yêu cầu được bằng hai entry; receipt hiển thị đúng PENDING/APPROVED/REJECTED/CANCELLED/expired.
- Giá và trạng thái sau gửi lấy backend; khách chỉ thấy món của mình. Chọn món/gửi PENDING không tự mở phiên, chiếm bàn, tạo private order hoặc gửi bếp.
- Intent retry chống trùng, guest access không trộn với staff auth và không âm thầm đổi identity để che lỗi.
- Reload trong cùng tab khôi phục đúng guest và yêu cầu của khách đó, không tự mint/submit; backend vẫn xác nhận quyền sở hữu. Giới hạn đóng tab/xóa storage/hết hạn/thu hồi được thể hiện rõ.
- Mã chia API/schema/policy/hook/store/component/page đúng cấu trúc, không có Axios trong UI, không thêm dependency hoặc thay scope Cashier.
- Bàn giao danh sách file sửa, luồng đã chạy, test/lint/build thực tế và giới hạn khôi phục qua sessionStorage/phụ thuộc nhân viên duyệt. Không publish/deploy tự động.
