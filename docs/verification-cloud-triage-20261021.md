# Thẩm định đề và đồng bộ kho đề: bản sửa để kiểm thử

Nhánh xuất phát từ main `d4468ec7fa3bbe36944e512be17ded94a13c7734` (đã có PR #51).
Không thay thang điểm, exporter, Firestore Rules hoặc cấu trúc bài nộp. Không merge/deploy trong đợt này.
`vercel.json` tắt auto-deployment **chỉ cho nhánh sửa lỗi này**, kể cả Preview.

## Kết luận có bằng chứng

- Google công bố model code `gemini-3.8-flash`, hỗ trợ structured output. Không đổi model để xử lý một lỗi quota chưa rõ nguyên nhân: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- Thẩm định và nút kiểm tra đều lấy key cục bộ qua `aiService.getApiKey()` (hoặc key giáo viên chủ động nhập để kiểm tra). Kiểm thử kiểm tra header SDK thực tế bằng key giả; không có key thật trong repository/test/log.
- Trạng thái `unverified` từng bị khởi tạo thành kết quả giống đã kiểm tra trong dialog. Đã chặn: mở/lưu dialog hoặc AI lỗi không được biến câu chưa thẩm định thành verified.
- Code cũ đợi toàn bộ đợt xong mới cập nhật kết quả trong dialog. Đợt sau lỗi làm phần đã thành công chưa hiện ra. Bản sửa trả `partialResults`, giữ quyết định cũ của các câu chưa hoàn tất, chỉ cập nhật câu có kết quả hợp lệ.
- Nhóm tối đa 4 TN hoặc 2 TL, yêu cầu tuần tự cách nhau ít nhất 1,5 giây; gộp yêu cầu đang chạy có cùng nội dung/key/model. Chỉ gọi vòng 2 độc lập cho câu chưa đủ căn cứ; không gửi đáp án/lời giải/vòng 1 vào vòng 2. Một đề mô phỏng 12 TN + 4 TL cần 5 yêu cầu nếu qua vòng 1, tối đa 10 nếu tất cả cần vòng 2.
- Mỗi yêu cầu có timeout 90 giây, một lần thử; 404/429/timeout không chuyển model, không tự duyệt câu thất bại. Timeout hủy chờ ở client, không khẳng định Google đã hủy tính phí phía server.
- Lỗi `QuotaExceededError` khi `setAssignments` chạy trước `setAssignments` của React có thể giữ màn hình ở cache 7 đề dù Cloud đã trả 119. Bản sửa đưa snapshot Cloud vào state và bộ nhớ phiên, không ghi toàn bộ kho đề vào LocalStorage. Cache trên đĩa cũ và bài nộp cũ không bị xóa.
- Nhánh tự migrate dữ liệu máy lên Cloud khi hồ sơ thiếu bị bỏ khỏi luồng đăng nhập. Không tự ghi đề cũ, không tạo lại lớp, không ghi `classes: []` lên hồ sơ. Truy vấn teacherId và teacherEmail vẫn là truy vấn đọc, không sửa quyền sở hữu đề cũ.
- Hồ sơ không có trường `classes`, trường có mảng rỗng, hồ sơ không tồn tại và đọc lỗi là bốn trạng thái khác nhau. Lỗi query email phải báo trạng thái đồng bộ chưa đầy đủ.

## Chưa thể xác nhận bằng mã nguồn

Không có phản hồi lỗi mới từ phiên thật hoặc quyền xem tài khoản Billing. Chưa thể khẳng định 429 thực tế của giáo viên do RPM, TPM, RPD, giới hạn chi tiêu, tải từ ứng dụng khác hay dự án nào. Chỉ hiển thị project/model/quota từ Google khi phản hồi có thông tin đó; nếu không thì ghi chưa xác định.

Tương tự, chưa đọc hồ sơ thật để kết luận hai cửa sổ dùng cùng Firebase UID hay `teachers/{uid}.classes` thật sự đang rỗng. Không suy ra dữ liệu lớp đã mất từ riêng số 0 trên giao diện.

## Kiểm tra an toàn bằng tài khoản giáo viên

**Hiện tại Production chưa có bản sửa này.** Không cần gửi API Key cho người khác và không dán key vào Console, issue, chat hoặc ảnh.

1. Trong Google AI Studio, tự đối chiếu dự án của key đã lưu với dự án Billing Tier 1 và model `gemini-3.8-flash`. Kiểm tra Rate limits/Usage và giới hạn chi tiêu của đúng dự án. Firebase project của ứng dụng là thông tin khác với dự án Gemini của key.
2. Trên Production hiện có PR #51, chỉ bấm **Kiểm tra API & Model** một lần. Nếu gặp 429 thì dừng, chờ theo thông báo; ghi lại model, quota ID/metric và project nếu được trả về. Không bấm lặp liên tục hoặc thay nhiều key của cùng dự án.
3. Không xóa LocalStorage, cache, đề hay bài nộp để khắc phục lỗi số lượng đề. Không bấm nhập/migrate/khôi phục dữ liệu mẫu trong lúc chẩn đoán.
4. Sau khi chủ ứng dụng cho phép triển khai bản sửa, mở **Cài đặt → Kiểm tra tài khoản và đồng bộ Cloud (chỉ đọc)** ở cửa sổ thường và ẩn danh. Đối chiếu UID phiên, Firebase UID, email truy vấn, số đề khớp UID/email, số đề Cloud/hiển thị và trạng thái trường lớp. Không chỉnh UID/teacherId/teacherEmail thủ công để ép hai cửa sổ giống nhau.
5. Kiểm tra thẩm định bằng một đề kiểm thử có đánh dấu rõ, bắt đầu riêng nhóm TN rồi TL. Nếu lỗi giữa chừng, các câu đã xong phải còn trên màn hình; thử tiếp không lặp lại phần đã có kết quả. Việc lưu thay đổi đề thật chỉ thực hiện khi giáo viên chủ động duyệt và cho phép ghi Cloud.

## Kiểm thử tự động (offline)

- `npm run check:verification-recovery`: cấu trúc Toán 9 mô phỏng 12 TN + 4 TL; hai vòng; giữ nguồn; key/model trong SDK request; không gọi lặp; 404, quota và timeout abort thật của SDK với đồng hồ test; giữ phần thành công trên dialog.
- `npm run check:cloud-cache`: 119 đề với cache đĩa chỉ có 7 và mọi ghi LocalStorage đều lỗi; Cloud vẫn tải, không ghi ngược; trạng thái UID/email/lớp; lưu Cloud một lần và tải lại metadata thẩm định, giữ nguyên đề/bài nộp cũ.
- Các regression hiện có kiểm tra học sinh nộp đề chưa thẩm định, giới hạn lượt, đảo đề, giáo viên duyệt đáp án, xử lý bài chờ chấm, bảo toàn điểm cũ và xuất phiếu.

Các adapter Cloud/Gemini trong test đều giả lập và bị chặn mạng. Đạt test không đồng nghĩa đã xác minh Billing/quota hoặc dữ liệu tài khoản thật.
