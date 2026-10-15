# Kiểm tra và tối ưu thẩm định đề, đáp án, chấm tự luận

Ngày kiểm tra: 12/10/2026. Nguồn: MATSUDA-AI-main (3).zip và bản sửa trước trong cùng phiên làm việc.

## Kết luận và giới hạn

Bản trước chưa tối ưu hết: thẩm định lượt hai gọi riêng từng câu, chấm lại có thể gọi lặp, và một số nhánh thiếu barem vẫn suy điểm từ tỷ lệ bước đúng. Bản này sửa các luồng đó, giữ tự luận cuối sau đảo đề, tách đáp án/lời giải khỏi nội dung đề và chuyển trường hợp thiếu căn cứ sang giáo viên duyệt.

Đã kiểm tra cơ chế bằng phản hồi AI giả lập, kiểm tra TypeScript và build. ZIP không có bài nộp thực tế của học sinh. Vì vậy chưa thể kết luận khả năng đọc chữ viết tay và chấm toán trên bài thật đã chính xác; cần đối chiếu ảnh bài làm, đề/barem và kết quả AI của một số bài thực tế.

## Thẩm định đề và đáp án

- Đọc đủ lời giải và barem của tự luận, giữ chữ hoa/thường của ký hiệu toán; không cắt lời giải ở 300 ký tự. Câu tự luận cũ bị gán nhãn trắc nghiệm nhưng chỉ có phương án mẫu được xử lý theo tự luận khi có dấu hiệu rõ ràng.
- Gom tối đa 4 câu mỗi lượt. Lượt đầu giải và đối chiếu nguồn; chỉ câu còn nghi vấn mới dùng lượt hai. Lượt hai không nhận đáp án nguồn hoặc kết quả lượt đầu. Đây vẫn là cùng mô hình AI, không phải hai hệ thống độc lập bảo đảm đáp án đúng.
- Kết quả thiếu/trùng mã câu, thiếu đáp án đối chiếu, hình nguồn không tải được hoặc phương án rỗng/mẫu không được tự xác nhận đúng. Những lỗi cấu trúc rõ được phát hiện tại máy, không cần thêm lượt AI.
- Lưu dấu nhận dạng của nội dung, phương án, đáp án, lời giải, barem, điểm, ảnh nguồn, khối/chủ đề và phiên bản cơ chế. Câu không thay đổi có thể dùng lại kết quả; sửa nguồn phải thẩm định lại câu đó. Chỉ đảo thứ tự không làm mất kết quả.
- Nút kiểm tra đề ưu tiên câu mới/chưa kiểm tra/đã đổi. Câu đã được giáo viên duyệt được giữ quyết định khi nguồn còn khớp. Một số đề cũ chưa có dấu nhận dạng vẫn giữ trạng thái đã duyệt để tránh tự gọi lại hàng loạt; muốn kiểm tra mới thì dùng nút từng câu.
- Hết hạn mức 429 thì dừng, giữ kết quả đã xong và không tự thử qua nhiều mô hình. Thử lại bình thường tận dụng lượt đã hoàn tất; nút yêu cầu kiểm tra mới cố ý gọi lại.

## Cơ chế chấm tự luận

- Một lượt Gemini 3.8 Flash nhận đề, lời giải/barem, hình nguồn, bài viết/ảnh học sinh và phân tích từng bước. Ảnh nguồn và ảnh bài làm được ghi nhãn riêng. Không thêm bước nhận diện ảnh bằng một lần gọi AI khác.
- Giữ toàn bộ lời giải nguồn; chỉ coi là barem có phân phối điểm khi nguồn thể hiện điểm cho các ý. Không coi cụm hình học như “3 điểm A, B, C” là điểm số.
- Ưu tiên điểm theo từng tiêu chí của barem. Giữ các mức như 0,1 hoặc 0,125 điểm; không ép về bước 0,25. Làm đúng một phần được điểm phần đó, không coi các dòng đã viết đúng là hoàn thành cả câu.
- Khi thiếu phân phối điểm, điểm AI chỉ là đề xuất cần duyệt. Đã bỏ công thức lấy tỷ lệ bước đúng hoặc tự nâng lên tối đa khi mọi bước đã viết đều đúng.
- Thiếu/không rõ ảnh, nhận dạng bước rỗng, độ tin cậy thấp, trạng thái bước không hợp lệ, thiếu barem hoặc điểm thành phần/tổng điểm mâu thuẫn đều cần giáo viên duyệt. Prompt có kiểm soát hình học và phần gạch bỏ; các kiểm soát này không thay thế việc kiểm chứng trên ảnh thật.
- Giữ điểm giáo viên đã duyệt khi chấm toàn bài. Kết quả AI không được giả làm điểm do giáo viên nhập. Nếu AI lỗi, giữ điểm hiện có và đánh dấu cần duyệt; không tự biến lỗi thành 0 điểm chính thức.
- Chấm trắc nghiệm không gọi AI. Khi đáp án nguồn được sửa, đối chiếu lại với nội dung phương án đã đảo trong bài nộp và cập nhật đáp án hiển thị. Không ánh xạ chắc chắn thì báo lỗi thay vì chấm nhầm.

## Số lượt gọi API

Các con số dưới đây là số lần gọi mô hình khi yêu cầu thành công bình thường, không phải cam kết mức giảm tiền theo cùng tỷ lệ.

| Tác vụ | Số lượt |
|---|---:|
| Chấm trắc nghiệm theo đáp án đã chốt | 0 |
| Mở ảnh, đáp án và kết quả đã lưu | 0 |
| Chấm một câu tự luận mới | 1/câu |
| Dùng lại kết quả chấm còn khớp toàn bộ đầu vào | 0 |
| Thẩm định 14 câu đều đạt ở lượt đầu | 4 |
| Thẩm định 14 câu đều cần lượt hai | 8; trước đó 18 |
| Sửa một câu rồi kiểm tra bình thường | Chỉ câu đó, thường 1–2 |
| Bấm chấm/kiểm tra mới từng câu | Gọi AI mới cho câu đó |

Gom câu giảm số yêu cầu. Lời giải và ảnh vẫn dùng token; đọc đủ nguồn có thể tăng token so với cắt ngắn. Không giảm chất lượng ảnh để tiết kiệm. Không bổ sung dịch vụ context caching trả phí của Google trong bản này.

Bộ nhớ kết quả ở trình duyệt có hạn 7 ngày, tối đa 160 mục và dung lượng khoảng 1,5 MB; lưu kết quả và dấu nhận dạng, không lưu API key hay dữ liệu ảnh trong bộ nhớ này. Kết quả chấm đã lưu cùng bài nộp có dấu nhận dạng còn khớp cũng được dùng lại khi giáo viên mở trên thiết bị khác, kể cả bộ nhớ trình duyệt đã hết hạn. Bài cũ chưa có dấu nhận dạng có thể cần một lần chấm mới khi người dùng yêu cầu. Chưa triển khai bộ nhớ đệm máy chủ cho các thiết bị gửi yêu cầu đồng thời.

## Cách dùng để giảm công kiểm tra và tiết kiệm API

1. Trước khi giao bài, kiểm tra số câu, tự luận cuối, đáp án và phân phối điểm; thẩm định phần mới/đã đổi rồi duyệt các câu còn nghi vấn. Hoàn thiện barem trước khi chấm cả lớp.
2. Sau khi học sinh nộp: vào **Kết quả**, chọn bài đã giao, mở **Xem bài/Duyệt bài** của học sinh. Mở câu tự luận, ảnh bài làm, **Đáp án và hướng dẫn chấm của đề**, phân tích từng bước và điểm. Việc xem này không gọi AI.
3. **AI chấm toàn bài** dùng lại kết quả còn khớp và giữ điểm giáo viên đã duyệt. Chỉ dùng **Chấm bằng AI (Từng bước)** ở câu thực sự cần kết quả mới; nút này cố ý gọi lại AI.
4. Nếu thấy điểm chưa đúng, nhập **Điểm**, **Lời phê**, bấm **Lưu**. Khi đủ điểm và đã duyệt các trường hợp cần kiểm tra thì **Chốt kết quả**. Sửa điểm trực tiếp không gọi AI.
5. Khi lỗi hạn mức, dừng và thử lại sau; không bấm liên tục. Luồng chấm có thời gian chặn gọi lại ngắn sau 429, luồng chấm cả lớp dừng hàng đợi khi gặp lỗi này.

API key là thông tin xác thực; thứ bị dùng là hạn mức yêu cầu/token. Hạn mức Gemini tính theo dự án, không theo từng key: https://ai.google.dev/gemini-api/docs/rate-limits . Không cần tạo thêm key cùng dự án để xử lý việc gọi lặp.

Trong mã hiện tại, thẩm định đề dùng key lưu ở trình duyệt; chấm từng bước qua máy chủ dùng biến GEMINI_API_KEY của máy chủ. Nhập key ở trình duyệt không tự cấu hình key máy chủ. Phiên kiểm tra này không truy cập cấu hình hay dữ liệu của web đang chạy.

## Các sửa trước được giữ

- Tách tiêu đề đáp án/hướng dẫn chấm khỏi đề, ghép lời giải theo câu nguồn, cảnh báo lệch số câu hoặc đáp án không ghép được; không tự mặc định A.
- Chọn đọc PDF bằng AI mà thiếu key thì báo rõ và dừng, không lặng lẽ chuyển sang bộ đọc khác.
- Tự luận cuối ở đề đã đảo, bản nháp khôi phục và màn hình giáo viên; giữ ID câu, phương án đã đảo và bài làm.
- Giữ luồng ảnh hiện có; bản này không thêm thao tác cắt hoặc giảm kích thước ảnh.

## Kiểm chứng mã nguồn

- npm run lint
- npm run build
- npm run check:exam-workflow
- npm run check:ai-efficiency
- node --import ./scripts/offline-test-guard.mjs --import tsx scripts/check-import-parsers.ts
- node scripts/test-point-distribution.mjs
- Bộ thử phần gạch bỏ bằng dữ liệu giả lập.

Kiểm tra đề mẫu 14 câu (10 trắc nghiệm + 4 tự luận, 10 điểm), tách đề/đáp án và đảo đề; kiểm tra số lượt API, dùng lại kết quả, đổi barem, giữ điểm giáo viên, ánh xạ đáp án đã đảo, điểm một phần, nguồn hình riêng, hạn mức và các đầu ra AI thiếu căn cứ. Các bài thử AI chặn mạng, dùng phản hồi giả lập và thay việc lưu bài bằng giả lập, không dùng API thật hoặc sửa điểm học sinh trên web.

Bản ZIP cần được cập nhật vào dự án đang chạy để có hiệu lực. Chưa triển khai lên web hoặc đẩy vào GitHub trong phiên này. ZIP không chứa node_modules, dist hay package-lock tạo tạm trong lúc kiểm tra.
