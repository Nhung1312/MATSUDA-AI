# MATSUDA AI — bảo vệ xem và lưu kết quả trước kỳ thi

Nhánh: `fix/exam-review-storage-safety-20261023`. Không merge, không deploy. Cấu hình Vercel vô hiệu tự deploy riêng nhánh này; CI chỉ build và kiểm thử ngoại tuyến.

## Giai đoạn 0: còn bị chặn một phần

Theo kiểm tra trước đó và số liệu giáo viên xác nhận: 119 đề, 1.951 câu; giao diện hiển thị 101 lượt nộp, 24 câu chờ duyệt thuộc 4 lượt. 25 đề có lượt nộp và 94 đề chưa có lượt nộp.

Đã đọc độc lập 119 tài liệu đề từ Firebase. **Chưa đọc và sao lưu độc lập đủ 101 tài liệu kết quả**: truy vấn kết quả gặp HTTP 403. Không coi 403 là dữ liệu rỗng. JSON xuất cũ chỉ có 2 lượt nộp mẫu, không dùng để khôi phục 101 lượt thật. Dữ liệu thật và bản kiểm kê không được đưa vào GitHub.

Dung lượng kho đề trong bản đọc trước: khoảng 2.194.364 byte JSON UTF-8 gọn; ước tính chuỗi UTF-16 khoảng 4.125.048 byte, gồm 47 chuỗi ảnh nhúng. Đây không phải phép đo tổng quota trình duyệt. Hai lượt mẫu khoảng 3.148 byte; lớp khoảng 567 byte. Chưa đo độc lập dung lượng các lượt trắc nghiệm cũ và các lượt tự luận thật. Không quy lỗi cho toàn bộ 101 lượt có ảnh.

Bản sửa không thực hiện chuyển đổi, tự hòa trộn, xóa cache hay ghi lại dữ liệu lịch sử. Chỉ chuẩn bị mã nguồn và thử dữ liệu giả. Trước triển khai cần quyền đọc hợp lệ để đối chiếu đủ ID, nội dung và tệp đính kèm, bao gồm dữ liệu chỉ có trên trình duyệt gốc.

## Thay đổi trong nhánh

- App giữ TeacherLayout khi đồng bộ nền; trạng thái tải lần đầu vẫn chặn số liệu chưa xác nhận. Giữ nguyên tab, bài đang chọn và nội dung đang nhập.
- Bản lưu được cập nhật vào state chung bằng sự kiện mang dữ liệu đã được máy chủ xác nhận. Refresh đang chạy không được hạ phiên bản vừa lưu.
- Firestore lưu bằng transaction, so phiên bản và SHA-256 của bản thực tế đã đọc. Bản cũ bị từ chối; không tự hợp nhất mảng đáp án hoặc tính lại điểm. Giữ createdAt, thêm updatedAt, saveRevision và saveOperationId khi có thao tác lưu hợp lệ.
- Chỉ báo thành công sau khi getDocFromServer xác nhận. Thử lại dùng cùng ID bài và ID thao tác, không gọi AI lại. Hàng đợi không được nhả khóa chỉ vì UI hết thời gian chờ.
- Bản chưa xác nhận được giữ riêng trong IndexedDB, không phụ thuộc cache localStorage lớn. Không tự gửi lại sau đăng nhập. Bản cũ được giữ để đối chiếu, không tự xóa.
- Cache Cloud của giáo viên dùng bộ nhớ phiên theo UID. Không ghi nguyên kho đề hoặc các lượt nộp xuống localStorage và không reset dữ liệu cũ.
- Nộp bài, phân tích ở trang học sinh, duyệt và thi trực tuyến dùng luồng xác nhận chung; trang học sinh không được cập nhật bản đã được giáo viên duyệt.
- Bài giấy mới lưu ảnh gốc một lần ở cấp bài; không nén lại ảnh, không chuyển đổi bài giấy cũ. Không ghi lại toàn bộ danh sách bài khác khi thêm một bài.
- Xuất JSON đọc Cloud trực tiếp, đối chiếu ID và nội dung qua hai lần đọc, giữ dữ liệu trình duyệt riêng. Thiếu quyền, thiếu ID hoặc dữ liệu đang thay đổi thì dừng. Manifest nêu rõ URL ngoài chưa được đóng gói; không tuyên bố sao lưu đủ tệp.
- Không đổi thuật toán AI, cách tính điểm, đáp án, barem hoặc câu hỏi; chỉ trả lại snapshot lưu đã xác nhận từ gradingService. Không đổi ID câu trùng của ba đề cũ.

## Kiểm thử và giới hạn

CI `Exam result safety (no deployment)`: TypeScript, build, kiểm thử lưu kết quả, ba đường điều hướng, và các kiểm thử hồi quy sẵn có. Kiểm thử mới chặn mạng và dùng bản ghi giả; không dùng bài thật để ghi thử. Xem trạng thái chạy và log trong PR; chưa coi là đạt trước khi CI hoàn tất.

Các tình huống trọng yếu: quota đầy; q1 → đóng/mở → q2; hai tab cạnh tranh; trang học sinh cũ; mất mạng; đã commit nhưng đọc lại thất bại; gửi lại không tăng số bài/phiên bản; giữ ảnh/phân tích/đề gốc; 101 ID độc lập trong bản giả; 403 và thiếu ID không tạo bản sao lưu “đầy đủ”.

**Điều kiện trước khi triển khai:** xác minh quyền đọc transaction/getDocFromServer của từng vai trò với Firebase đang chạy. Quy tắc trong repo chưa được xác nhận là quy tắc production. Chưa triển khai hoặc sửa rules.

**Giới hạn chống ghi đè:** code mới từ chối bản cũ trong hai tab/trang chạy bản mới. Một tab còn chạy JavaScript trước bản vá có thể bỏ qua hoàn toàn cơ chế client. Cần kiểm tra và bổ sung ràng buộc phiên bản/giáo viên ở phía Firebase, thử bằng emulator và staging, trước khi khẳng định đã bảo vệ mọi client cũ. Không tự đổi rules production vì có thể chặn nộp bài đang hoạt động.

IndexedDB cũng có thể đầy hoặc bị trình duyệt chặn; lúc đó vẫn thử Cloud, hiển thị đúng chưa có bản dự phòng và yêu cầu giữ cửa sổ. Dữ liệu chờ/đã xác nhận chưa tự dọn khi chưa đối chiếu và sao lưu.

Giai đoạn 2 phân trang truy vấn và tải chi tiết theo nhu cầu, Giai đoạn 3 tinh gọn giao diện được để riêng sau khi bảo vệ lưu trữ, quyền và dữ liệu thật đã được kiểm chứng. Bản vá này chưa tuyên bố đã thực hiện phân trang máy chủ hoặc sao lưu đủ 101 lượt thật.
