# Khôi phục có chọn lọc AI Thẩm định đề

Phạm vi: nhánh `fix/exam-verification-server-20261024`, nền `main` tại `579881ef7259d1eea523db33d8ce9e7585eb3727`. Không thay mã AI chấm bài thủ công của PR #61.

## Kết luận đối chiếu mã nguồn

- `b2654f8`: có `hasTrustedEssaySecondPassAgreement`, cho phép câu tự luận có nguồn rõ, lượt đầu khớp nguồn và lượt độc lập xác nhận đầy đủ thoát trạng thái nghi vấn. Mã sau khôi phục tại `a21a8ae` đã mất hàm này và dùng điều kiện `uncertain = essay || ...`: mọi câu tự luận đi tới lượt hai đều bị giữ nghi vấn, bất kể kết quả đối soát.
- Khôi phục riêng logic đối soát trên, giữ kiểm tra đủ ý, chữ hoa/thường, dấu phép toán. Dùng Unicode NFC để không biến số mũ thành chữ số thường; không khôi phục phép chuẩn hóa NFKC cũ.
- `6df4540`: không mặc định đáp án A, không ép mọi câu thành trắc nghiệm khi lưu, tách thẩm định tự luận/trắc nghiệm và bảo vệ lựa chọn giáo viên. Khôi phục riêng các phần này trong cửa sổ thẩm định; không khôi phục toàn bộ cây mã cũ.
- Luồng cũ gọi Gemini trong trình duyệt qua key cục bộ. Chỉ luồng Thẩm định đề chuyển sang endpoint máy chủ, dùng `GEMINI_API_KEY` hiện có. Không sửa biến môi trường, key, model hay cấu hình bảo mật.

## Các thay đổi

- `server/verificationPrompts.ts`: chuyển nguyên hai prompt hiện có lên server. Lượt độc lập không nhận đáp án/lời giải nguồn hoặc kết quả lượt đầu. Model giữ `gemini-3.8-flash`, nhiệt độ 0.1. Ảnh gốc không nén hoặc đổi chất lượng.
- `server/routes/examVerification.ts`, `server.ts`: API `/api/exam-verification/pass`, tối đa bốn câu/lô, giới hạn JSON 4.000.000 byte, timeout 90 giây, không retry SDK. Hợp nhất yêu cầu trùng đang chạy trong cùng instance. Chỉ log mã yêu cầu, trạng thái và thời gian; không log nội dung/key. Không truy cập Firebase.
- `examVerificationTransport.ts`, `verificationOptimizer.ts`: không đọc/gửi key trình duyệt; giữ batch/cache, tái dùng lượt một khi thử lại; dừng khi 429. Lỗi dịch vụ không bị biến thành kết luận toán học. Phiên bản cache mới không xóa cache cũ.
- Phân biệt bốn lý do: đáp án chưa khớp cần đối chiếu; thiếu đáp án/hướng dẫn chấm; thiếu/chưa đọc được dữ kiện; AI chưa xác minh. Không tự kết luận câu sai chỉ từ cờ `needs_review` cũ.
- `AiSolveExamModal.tsx`: rộng tối đa 1440px, cao 96dvh; phần công cụ, tổng kết và câu hỏi cuộn cùng nhau, chỉ giữ đầu/cuối cố định. Chữ câu hỏi 18–20px, điều khiển 14px; hiển thị ảnh và phương án không cắt cụt. Không có ô nhập key. Không tự chọn đáp án AI. Lựa chọn đang sửa của giáo viên được giữ khi AI lỗi. Chặn duyệt/lưu nếu ID câu bị trùng, không sửa ID.
- `TeacherAssignments.tsx`, `AiBatchSolveModal.tsx`: chờ Cloud xác nhận trước khi báo đã lưu; cache đầy không chặn kết quả Cloud đã được xác nhận. Không nuốt lỗi lưu Cloud. Đáp án gốc chỉ đổi sau thao tác chấp nhận/tự sửa rõ ràng trong cửa sổ giáo viên; thẩm định hàng loạt chỉ ghi thông tin đối soát.

## GK1 Toán 7 — giới hạn chứng cứ

Đã xác nhận nguyên nhân hồi quy trong mã có thể giữ toàn bộ câu tự luận ở trạng thái nghi vấn khi cần lượt hai. Chưa có bản đọc đầy đủ, hiện hành của 17 câu GK1 trong dữ liệu dùng cho nhiệm vụ này; các bản sao lưu riêng tư đã đọc đối chiếu không chứa đúng mã đề được yêu cầu. Không đọc lại tài khoản thật, không sửa đề thật và không gửi đề thật sang Gemini trong lần sửa này.

Vì vậy **chưa xác định được số câu sai thật, thiếu đáp án, thiếu hình/dữ kiện hoặc chưa xác minh trong chính đề GK1**. Bộ 17 câu giả chỉ chứng minh đã sửa điều kiện đánh dấu hàng loạt; không phải kết luận về 17 câu thật. Cần bản xuất chỉ đọc của đúng đề hoặc một lần xem hợp lệ sau khi giáo viên đăng nhập để phân loại từng câu. Cờ nghi vấn đã lưu trước đây không tự bị xóa hay ghi lại.

## Kiểm thử

Tất cả dùng dữ liệu giả, chặn kết nối ra ngoài trong tiến trình kiểm thử. Không ghi Firebase Production, không gọi Gemini thật trong nhiệm vụ này.

| Kiểm thử | Kết quả |
| --- | --- |
| `npm run lint` | Đạt |
| `npm run build` | Đạt; còn cảnh báo bundle lớn đã có từ trước |
| `npm run check:verification-restoration` | Đạt: client → handler server thật → SDK với phản hồi giả; hai lượt, bốn lý do, 17 câu tự luận, bảo vệ ký hiệu/đủ ý, ảnh nguyên byte, cache đầy, yêu cầu trùng, lỗi 400/429/500, cấu hình thiếu và thử lại an toàn |
| `npm run check:verification-review-ui` | Đạt: component/handler thật; không nhập key/không mặc định A; duyệt → lưu giả → mở lại; Cloud lỗi; cache đầy; giữ lựa chọn khi AI lỗi; thẩm định hàng loạt không bỏ qua câu thiếu đáp án |
| `npm run check:exam-workflow` | Đạt: nhập đề, đảo đáp án và chấm lại bằng phản hồi giả |
| `npm run check:ai-efficiency` | Đạt: tái dùng cache, dừng quota, bảo vệ kết quả; không gọi mạng thật |
| Đối chiếu phạm vi với nền main | Mã chấm thủ công, lưu bài học sinh, Firebase Rules, cấu hình Vercel/Vite và các biến môi trường không thay đổi |

Các lần mô phỏng Cloud lỗi cố ý có log lỗi trong test; đây là điều kiện kiểm thử, không phải lỗi lưu dữ liệu thật.

## Còn phải xác nhận trước khi triển khai

1. Một lượt thẩm định đề giả trên Preview bằng Gemini thật để xác nhận endpoint mới và biến `GEMINI_API_KEY` trong môi trường Preview; kết quả Gemini thật của PR #61 không thay cho phép thử endpoint mới này. Không cần đổi key/model.
2. Kiểm tra trực quan giao diện trên Preview/màn hình giáo viên. Trình duyệt đám mây đã chặn mở tệp demo local; không dùng cách vòng qua hạn chế đó. Các kiểm thử component và lớp bố cục đã đạt, chưa có ảnh chụp giao diện Preview mới.
3. Đọc đúng 17 câu GK1 để đưa ra phân loại từng câu. Không tự sửa các cờ nghi vấn/đáp án đang lưu trên Production.

Chưa merge, chưa deploy Production. Các bản sao lưu riêng tư giữ nguyên, không đưa dữ liệu học sinh lên nhánh/PR.
