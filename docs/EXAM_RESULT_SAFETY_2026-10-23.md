# PR #58 — nộp bài trước, giáo viên chấm AI sau

Bản vá tiếp tục trên nhánh `fix/exam-review-storage-safety-20261023`; chưa merge/deploy. Không đổi database, dữ liệu lịch sử, thuật toán AI, đáp án hoặc thang điểm. Không sửa/publish Security Rules production. Không ghi thử dữ liệu thật.

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

Chỉ dùng dữ liệu giả. AI được mô phỏng trong kiểm thử luồng, không tuyên bố đã chấm thử bằng API thật hoặc đã xác nhận trên production. Kết quả chạy và CI được ghi trong PR.

## Còn cần trước triển khai

1. CI commit mới đạt và giáo viên đồng ý merge/deploy. `vercel.json` vẫn tắt tự deploy nhánh; workflow chỉ kiểm thử.
2. Kiểm thử môi trường thử nghiệm với đúng tài khoản/cấu hình API và quota phục vụ ngày thi. Không tự nâng billing hoặc thay Rules.
3. Giữ thông báo đúng cho bài quá lớn và mất hoàn toàn biên nhận. Không suy đoán thành công từ permission-denied.
4. Sao lưu thật trước đây vẫn chưa đủ: 87/105 ID quan sát, còn 18 ID chưa đọc do quota. Số 101 trước đây và 103 do giáo viên báo sau hai lượt mới chưa đối chiếu độc lập. Các bản sao được giữ riêng ngoài Git; nhiệm vụ này không mở rộng rà soát dữ liệu.
