# Tự kích hoạt AI sau nộp — kiểm tra an toàn ngày 23/10/2026

**Trạng thái: CHƯA BẬT TỰ ĐỘNG. Cần bổ sung và phê duyệt tác vụ máy chủ trước.**

Nhánh `audit/auto-ai-after-submit-20261023`, dựa trên main `041a5817a11add993609ea028cf51dfb8dc83e98` (PR #58 + #59). Chỉ thêm báo cáo này và tắt tự deploy nhánh kiểm tra trong `vercel.json`. Không thay mã ứng dụng, bộ chấm, công thức điểm, Rules hoặc dữ liệu. Chưa merge/deploy; không dùng dịch vụ mới hay bật thanh toán.

## Những gì đã có

| Vị trí | Hành vi đã xác định |
| --- | --- |
| `src/pages/student/StudentExamPage.tsx`, `saveToCloudAndFinish` | Chờ `saveSubmissionConfirmed(..., { intent: 'student' })`; chỉ hoàn tất sau `cloudSaved`. Bài có đầy đủ đáp án, lời giải, ảnh trước khi AI chạy. |
| `src/services/firestoreService.ts`, `saveVersionedResult` | Học sinh dùng create, không đọc trước/đọc lại. Giáo viên dùng transaction, phiên bản và đọc lại server. |
| `src/services/stepGradingService.ts`, `analyzeStepByStep` | Gọi bộ chấm hiện có tại `/api/grading/step-analysis`; có cache fingerprint và `inFlight` trong một phiên JavaScript. |
| `server/routes/grading.ts` | AI đọc ảnh, phân tích từng bước, lỗi đầu tiên/lỗi kéo theo, đề xuất điểm và trả HTTP response. Endpoint này không nhận sự kiện Firestore và không tự lưu kết quả vào `results`. |
| `src/pages/teacher/TeacherResults.tsx`, `handleAiGradeSingleQuestion` | Nút AI thủ công gọi bộ chấm rồi lưu theo luồng giáo viên. Giữ nguyên nút dự phòng. |
| `src/services/gradingService.ts`, `gradeSingleSubmissionWithAI` | Có bộ điều phối chấm bài, tái dùng kết quả AI, bỏ qua câu đã có điểm giáo viên khi không yêu cầu chấm lại. Kết quả vẫn cần giáo viên duyệt. |

## Phần thiếu để chạy khi học sinh đóng trang

Trong repo và cấu hình triển khai đã kiểm tra chưa có Firestore trigger, worker xử lý bền vững, hàng đợi tự chạy/retry, hoặc Firebase Admin SDK và adapter ghi kết quả phía máy chủ. `api/index.ts` chuyển request vào Express; `server.ts` gắn các route HTTP. `vercel.json` không cấu hình lịch hoặc worker. Không khẳng định mọi dịch vụ bên ngoài repo đều không tồn tại: lần này không đăng nhập Console để kiểm kê hạ tầng ngoài repo hoặc xác minh lại billing/quyền IAM.

Vì vậy không chỉ thêm `void analyzeStepByStep()` sau `cloudSaved`: học sinh có thể đóng trang giữa ACK và lúc gửi yêu cầu AI, hoặc sau khi AI trả về nhưng trước khi client lưu. Kết quả phân tích sẽ không được bảo đảm lưu lại. Theo Rules fixture đã đối chiếu ngày 23/10, học sinh không có quyền đọc/cập nhật `results`; gọi lại luồng ghi giáo viên từ trang học sinh không tạo ra quyền đó. Lần này kiểm thử fixture, không tuyên bố đã đọc lại Rules production.

`inFlight` hiện tại chỉ chống gọi đồng thời trong cùng phiên JavaScript; không phải khóa toàn hệ thống giữa nhiều tab, nhiều máy hay lần chạy lại của server. Cơ chế phiên bản bảo vệ việc lưu điểm hiện có không đồng nghĩa với khóa chống gọi Gemini trùng.

Vercel `waitUntil()` có thể giữ tác vụ chạy sau HTTP response, nhưng vẫn bị giới hạn bởi thời gian sống của invocation. Nó không tự cung cấp sự kiện Firestore, bản ghi công việc, quyền ghi hay khả năng phục hồi sau timeout. Vì vậy chưa dùng nó để hứa hẹn tự chấm an toàn chỉ bằng sửa vài dòng ở trình duyệt.

## Phạm vi tối thiểu cần được phê duyệt riêng

Đây là yêu cầu bổ sung hạ tầng, chưa được triển khai:

1. Một tác vụ máy chủ được kích hoạt từ **document bài nộp mới đã commit**, không phụ thuộc trình duyệt học sinh gửi thêm request. Chỉ xử lý bài mới đủ điều kiện, không quét/chấm lại các bài cũ hoặc câu đã duyệt.
2. Quyền máy chủ đọc bài/đề và ghi đề xuất AI hợp lệ; lưu bí mật trên server. Không mở Rules cho học sinh, không dùng hoặc sao chép phiên đăng nhập giáo viên làm worker.
3. Trạng thái công việc bền vững, khóa theo ID bài + ID câu + fingerprint đầu vào + phiên bản bộ chấm; nhận việc bằng transaction. Event trùng, nhiều worker hoặc thao tác AI thủ công không được gọi đồng thời cho cùng câu. Giữ bài gốc và đề xuất đã có khi AI lỗi.
4. Khi lưu phải đọc phiên bản mới, kiểm tra quyền sở hữu công việc và điểm giáo viên. Chỉ ghi phần phân tích/đề xuất còn hợp lệ, không ghi đè điểm, lời phê, trạng thái đã duyệt hoặc toàn bộ mảng đáp án cũ. Giữ các câu khác và thang điểm hiện có.
5. Gọi lại bộ chấm hiện có và dùng cùng dữ liệu đề, barem, ảnh; không viết lại prompt/thuật toán. Giới hạn số lần gọi/quota. Nếu worker mất sau khi gọi AI nhưng chưa xác nhận lưu, không tự hứa "exactly once": chuyển việc chưa rõ kết quả sang đối chiếu/thử lại có kiểm soát, tránh lặp phí AI vô hạn.

Một phương án phù hợp sự kiện document mới là Firebase Cloud Functions `onDocumentCreated`, nhưng triển khai Functions yêu cầu dự án Blaze. Chưa xác minh dự án hiện tại có Blaze; chưa bật/nâng gói hoặc thêm dịch vụ. Gemini Tier 1/API key không tự cung cấp tác vụ nền hay quyền ghi Firebase. Nếu có worker hợp lệ được triển khai ngoài repo, cần đối chiếu worker đó trước khi chọn phương án mới.

## Kiểm thử đã thực hiện

Chỉ chạy `check:submit-first-emulator`, không chạy lại toàn bộ CI hoặc gọi Gemini thật. Dùng JDK 21 đã có, `demo-matsuda-submit-first`, Firestore Emulator `127.0.0.1:8097`, AI giả. Các cờ live AI đều bằng 0. Fixture Rules SHA-256: `02ca86dd5a88131f85b0b60de630412ad7fcefd43e596a22f71d0496653f7ba8`.

| Kiểm tra luồng hiện có | Kết quả |
| --- | --- |
| Học sinh không đăng nhập nộp trắc nghiệm, tự luận văn bản, tự luận ảnh; ACK trước AI | PASS |
| Học sinh không được đọc/sửa kết quả; gửi lại giữ ID, không ghi đè | PASS |
| Mất mạng, mất ACK, nhấp nộp lặp | PASS — không báo thành công giả |
| AI giả trả lỗi 429/500 sau nộp | PASS — bài, ảnh và điểm trắc nghiệm còn nguyên |
| AI từng bước có lỗi đầu tiên/lỗi kéo theo; giáo viên duyệt, lưu và đọc lại | PASS — phân tích chờ duyệt; điểm đã duyệt được giữ |
| Tab cũ/học sinh cũ không ghi đè; không tự chấm lại câu đã duyệt | PASS |
| localStorage đầy; document vượt giới hạn | PASS — cache không chặn Cloud, bài quá lớn không báo thành công |
| Tự kích hoạt khi học sinh đóng trang | CHƯA CÓ — không có trigger/worker trong mã hiện tại; không tuyên bố PASS |
| Khóa chống gọi AI giữa nhiều worker/tab | CHƯA TRIỂN KHAI — `inFlight` hiện tại không đủ cho yêu cầu này |

Lệnh kết thúc exit code 0 / `SUBMIT FIRST EMULATOR PASS`. Lỗi permission-denied và quota trong log là ca âm chủ động bằng dữ liệu giả. **Số lần gọi AI thật: 0. Ghi production: 0.** Không đọc lại dữ liệu học sinh thật, không đụng các bản sao lưu riêng. Build/lint không chạy lại vì không sửa mã ứng dụng; JSON cấu hình nhánh được kiểm tra cú pháp riêng.

## Kết luận cho phạm vi yêu cầu

Bộ chấm đã có và tiếp tục được dùng bằng nút AI thủ công/hàng loạt sau khi bài lưu thành công. Chưa bật tự chấm nền vì chưa có đủ phần nhận sự kiện, quyền lưu máy chủ và chống trùng bền vững. Bản website đang chạy giữ nguyên. Cần phê duyệt phương án hạ tầng và chi phí (nếu có) trước khi thêm phần điều phối, rồi kiểm thử giả lập đóng trình duyệt, event trùng và cuộc đua AI/giáo viên trên Emulator.

Nguồn chính thức đã đối chiếu ngày 23/10/2026:

- https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package (`waitUntil`: cùng timeout với function; bị hủy khi timeout).
- https://firebase.google.com/docs/functions/firestore-events (`onDocumentCreated`; sự kiện có thể được phát nhiều lần, cần idempotency).
- https://firebase.google.com/docs/functions/get-started (triển khai Functions cần Blaze; Emulator không cần triển khai production).
