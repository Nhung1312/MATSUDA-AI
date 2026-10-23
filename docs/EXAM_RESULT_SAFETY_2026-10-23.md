# PR #58 — nộp bài trước, giáo viên chấm AI sau

Bản vá tiếp tục trên nhánh `fix/exam-review-storage-safety-20261023`; chưa merge/deploy. Không đổi database, dữ liệu lịch sử, thuật toán AI, đáp án hoặc thang điểm. Không sửa/publish Security Rules production. Không ghi thử dữ liệu thật.

## Trạng thái dừng kiểm thử theo yêu cầu giáo viên — 23/10/2026

Đã dừng phiên chạy cuối theo yêu cầu; không chạy lại AI, không merge/deploy. Bổ sung cuối chỉ là mã kiểm thử và fixture ảnh giả, không đổi mã ứng dụng hoặc thuật toán chấm.

- Commit ứng dụng `cf9fc61` đã đạt 14 bước CI. Trong lượt cuối, cache-pressure, ba đường mở Kết quả, TeacherResults UI, submit-first UI, lint/build đã chạy lại và đạt.
- Gọi trực tiếp API AI hiện có bằng ảnh giả: HTTP 200, `analysisSource: ai`, khoảng 23 giây; đọc đủ 5 bước, phát hiện lỗi đầu tiên ở bước 3 và 2 bước kéo theo. Endpoint chấm không lưu Firestore.
- Ca tích hợp TeacherResults + AI thật + Emulator có lần hết thời gian chờ 55 giây. Lần chạy tiếp theo đã bị dừng theo yêu cầu trước khi có kết quả cuối; **chưa xác nhận ca tích hợp cuối đạt**, không xác định timeout là lỗi ứng dụng hay đường truyền kiểm thử.
- Giữ helper kiểm thử thủ công `run-live-ai-review-smoke.mjs` cùng fixture ảnh chỉ chứa dữ liệu giả. Chỉ gọi AI khi đặt rõ `MATSUDA_LIVE_AI_SMOKE=1`; CI mặc định không bật. Giới hạn một request AI mỗi phiên, URL cố định, chặn redirect, chỉ cho gửi fixture giả; kết quả bài nộp chỉ ở project Emulator `demo-matsuda-submit-first`.
- Chưa đủ căn cứ tuyên bố sẵn sàng triển khai toàn bộ luồng AI thật. Các giới hạn cũ vẫn còn: document quá 1 MiB bị chặn và giữ bản chờ, chưa phân trang/tải chi tiết theo nhu cầu. Chưa ghi thử Firebase production hoặc thay Rules.

## Luồng đã sửa

1. `StudentExamPage` dùng bộ chấm trắc nghiệm hiện có qua `buildStudentSubmission`, giữ đáp án, lời giải, ảnh và snapshot đề; không gọi AI khi nộp.
2. Học sinh dùng `setDoc` và chờ backend xác nhận, không transaction/get/readback. Giáo viên tiếp tục transaction + revision/fingerprint + đọc lại server của PR #58.
3. Sau xác nhận mới hiện **NỘP BÀI THÀNH CÔNG**: điểm trắc nghiệm theo quyền xem của đề, tự luận chờ AI/giáo viên, tổng kết chưa chốt. Học sinh có thể đóng trang. Cache tiến độ hoặc âm thanh lỗi không chặn trang xác nhận.
4. Giáo viên chủ động chấm AI từng bước và duyệt. Lõi phân tích lỗi đầu tiên/lỗi kéo theo và đề xuất điểm không đổi. Bài mới vẫn chờ giáo viên chốt; lỗi AI không làm mất bài đã nộp. Không tự chấm lại bài cũ/câu đã duyệt.
5. Giữ sửa điều hướng của PR #58: TeacherLayout không remount khi đồng bộ; giữ tab, đề, ID bài và đầu vào chưa lưu qua ba đường Kết quả/thẻ đề/hàng chờ.

## Rules và gửi lại

Fixture `tests/fixtures/firestore.production-20261023.rules` là bản đã đọc từ Console, SHA-256 `02ca86dd5a88131f85b0b60de630412ad7fcefd43e596a22f71d0496653f7ba8`. Chỉ dùng để kiểm thử Emulator, không thay Rules triển khai. Test bắt buộc project `demo-matsuda-submit-first`, host `127.0.0.1:8097`; chặn fetch ra ngoài loopback.

- Người chưa đăng nhập được create hợp lệ; không get/list/update kết quả. Giáo viên đúng UID đọc/sửa được. Không mở đọc công khai để vượt lỗi 403.
- ID, operation và payload giữ nguyên sau lỗi. Bấm lặp chia sẻ một write. Biên nhận server xác nhận được giữ trong IndexedDB; gửi lại cùng nội dung dùng biên nhận, không write mới. Tra bản chờ/biên nhận theo khóa, không đọc toàn bộ kết quả vào RAM.
- Nếu server commit nhưng mất hoàn toàn phản hồi, gửi lại cùng ID bị Rules từ chối. Client không có quyền đọc nên **không thể tự xác nhận**: giữ pending để giáo viên đối chiếu, không báo thành công hay tạo ID mới. SDK mất mạng trong cùng phiên giữ write đang chờ; xác nhận muộn hoàn tất đúng lượt.
- Không reset IndexedDB/cache cũ. Khi tải lại có pending cùng đề/học sinh, chọn đúng bản gửi để tiếp tục; không tự gộp lượt nộp.

## Ảnh và giới hạn

Kiểm tra kích thước document trước lưu theo quy tắc Firestore; bài mới để thêm 16 KiB dự phòng. Giữ nguyên ảnh/lời giải, không nén hoặc tách/đổi bài cũ. Bài vượt giới hạn 1 MiB không được báo nộp thành công; giữ bản chờ và ảnh gốc, cần giáo viên nhận/đối chiếu. Chưa thêm kho ảnh ngoài document trong phạm vi này. Khi lưu phân tích AI quá lớn, bài gốc trên Cloud vẫn được giữ.

Nguồn: https://firebase.google.com/docs/reference/js/firestore#setdoc ; https://firebase.google.com/docs/firestore/storage-size ; https://firebase.google.com/docs/firestore/quotas .

## Kiểm thử

- `check:submit-first-emulator`: Firebase SDK thật + đúng Rules fixture; trắc nghiệm, tự luận văn bản/ảnh; quyền create/read/update; SDK offline/reconnect; gửi lại, double click, mất phản hồi sau commit; bài quá lớn; AI 429/500; AI sau lưu; giáo viên duyệt/readback; snapshot cũ không ghi đè; không chấm lại câu đã duyệt; contest create dùng cơ chế chung.
- `check:submit-first-ui`: handler thật của StudentExamPage/App; chờ Cloud trước finish, không gọi AI ở học sinh, chống bấm lặp, giữ ID khi khôi phục, biên nhận/ẩn điểm, cache tiến độ đầy.
- `check:teacher-navigation`: App + TeacherLayout thật, ba đường mở Kết quả; giữ lựa chọn và đầu vào khi refresh/chậm/lỗi.
- `check:teacher-review-ui`: màn TeacherResults thật; mở trắc nghiệm mới và tự luận chờ, đủ ảnh/lời giải/phân tích; q1 → đóng/mở → q2; xác nhận muộn; AI chỉ khi giáo viên bấm và còn phải duyệt.
- Giữ kiểm tra `check:result-safety`, `check:review-save`, `check:exam-workflow`, `check:ai-efficiency`, `check:imports`, `test:strikeout`, `test:points`; chạy lint/build.

## Bổ sung bảo vệ cache đầy

- Tái hiện được `QuotaExceededError` khi đã có dữ liệu cũ nhưng thiếu cờ khởi tạo. Trước sửa, `StorageService.initDemoData()` ném lỗi ra các getter của trang học sinh. Sau sửa, chỉ thử khởi tạo một lần mỗi phiên trang, giữ nguyên chuỗi cache cũ và tiếp tục đọc; demo dự phòng có thể dùng trong RAM.
- Bài học sinh đã được Firebase xác nhận không còn đọc rồi ghi lại toàn bộ mảng `toan_thcs_submissions_v4`. Chỉ giữ bài hiện tại trong RAM và biên nhận đầy đủ theo khóa trong IndexedDB. Cache Cloud của giáo viên vẫn ở RAM theo UID. Không xóa hoặc tự chuyển đổi dữ liệu cũ/bản nháp.
- Khôi phục bản gửi chờ dùng cursor trên database v1 hiện có, chỉ tích lũy bản phù hợp tài khoản/trạng thái; không dùng `getAll()` để giữ mọi biên nhận và ảnh trong RAM. Bản sao lưu chủ động vẫn có thể lấy cả bản đã xác nhận. Cursor còn phải quét từng bản; chưa thêm index/migration.
- `check:cache-pressure` dùng 119 đề có ảnh giả, 100 bài trắc nghiệm cũ giả và một bài tự luận giả; đo riêng từng nhóm, quota luôn từ chối ghi. Kiểm tra cache Cloud không ghi disk, dữ liệu/ảnh/nhận xét/bản nháp cũ giữ nguyên byte, nộp mới và gửi lại không sao chép toàn bộ mảng. Đây là dữ liệu thử, **không phải dung lượng production**.
- Emulator nay dùng `StorageService` thật với localStorage giả luôn đầy, thay cho mock cache. Nộp bài hỗn hợp, AI/duyệt điểm/đọc lại server được kiểm chứng với đúng Rules fixture. Luồng contest giữ cách đếm/lưu lịch sử hiện có; lỗi quota của cache contest vẫn được bắt để không chặn xác nhận Cloud.

Phạm vi này xử lý việc localStorage đầy chặn luồng chính và ghi lặp không cần thiết. Chưa hoàn thành phân trang/tải chi tiết theo nhu cầu: màn giáo viên vẫn tải đầy đủ danh sách Cloud vào RAM. Không tuyên bố đã giải quyết toàn bộ tiêu thụ RAM hoặc đã kiểm thử đầy đủ trên thiết bị giáo viên. Cache cũ có thể vẫn đầy vì được bảo toàn; không cần reset để dùng các luồng đã sửa.

Chỉ dùng dữ liệu giả. AI được mô phỏng trong kiểm thử luồng, không tuyên bố đã chấm thử bằng API thật hoặc đã xác nhận trên production. Kết quả chạy và CI được ghi trong PR.

## Còn cần trước triển khai

1. CI commit mới đạt và giáo viên đồng ý merge/deploy. `vercel.json` vẫn tắt tự deploy nhánh; workflow chỉ kiểm thử.
2. Kiểm thử môi trường thử nghiệm với đúng tài khoản/cấu hình API và quota phục vụ ngày thi. Không tự nâng billing hoặc thay Rules.
3. Giữ thông báo đúng cho bài quá lớn và mất hoàn toàn biên nhận. Không suy đoán thành công từ permission-denied.
4. Sao lưu thật trước đây vẫn chưa đủ: 87/105 ID quan sát, còn 18 ID chưa đọc do quota. Số 101 trước đây và 103 do giáo viên báo sau hai lượt mới chưa đối chiếu độc lập. Các bản sao được giữ riêng ngoài Git; nhiệm vụ này không mở rộng rà soát dữ liệu.
