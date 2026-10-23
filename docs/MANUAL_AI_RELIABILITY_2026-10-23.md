# Kiểm chứng AI chấm thủ công — 23/10/2026

Nhánh `fix/manual-ai-grading-reliability-20261023`, từ production/main `041a5817a11add993609ea028cf51dfb8dc83e98`. Không triển khai, không thay Rules, không sửa dữ liệu production; không bổ sung chấm nền hay dịch vụ mới.

## Kết luận có bằng chứng

- Vercel Runtime Logs và phần chi tiết Request được đọc bằng phiên quản trị hợp lệ. Gói Hobby chỉ hiển thị lịch sử tối đa một giờ trong UI. Request giáo viên lúc 19:57:50 GMT+7 ngày 23/10: execution 16,48 giây / maximum 5 phút, response finished 17,5 giây; có gọi `gemini-3.8-flash:generateContent`. Không thấy lỗi Gemini hay platform timeout trong request này. Chưa đủ bằng chứng gắn nó với lỗi trình duyệt người dùng báo.
- Request bài giả của kiểm thử lúc 20:56:06 GMT+7: execution 12,59 giây / 5 phút, response finished 13,1 giây; gọi cùng model. Phía kiểm thử nhận HTTP 200, `analysisSource=ai`, sau 19.973 ms gồm truyền qua môi trường kiểm thử. Toàn bộ handler AI gồm lưu/đọc lại khoảng 20.081 ms.
- UI cấu hình Vercel xác nhận `GEMINI_API_KEY` và `GEMINI_FREE_API_KEY` có ở Production và Preview. Không mở giá trị, đổi key hay cấu hình model.
- `ERR_NETWORK_IO_SUSPENDED` là mã Chromium khi network I/O bị suspended; riêng mã này không chứng minh Gemini hay Vercel timeout. Chưa tái hiện lỗi gốc hoặc xác định sự kiện gây suspension trên thiết bị giáo viên. Không thay giới hạn thời gian theo suy đoán.
- Lỗi mã nguồn đã xác nhận: client gom lỗi HTTP vào lỗi mạng; server che lỗi Gemini/cấu hình bằng HTTP 200 dự phòng; chấm toàn bài có thể xóa phân tích/điểm AI cũ và báo “đã phân tích” khi không nhận phân tích thật; thông báo thành công AI không kiểm tra Firebase đã xác nhận lưu.

## Thay đổi giới hạn phạm vi

| Tệp | Thay đổi |
| --- | --- |
| `server/routes/grading.ts` | Phân biệt lỗi cấu hình, Gemini và phản hồi không hợp lệ; trả HTTP lỗi đúng; log request ID/status/duration không chứa bài làm, ảnh, prompt hoặc key. Không thay prompt/schema/chuẩn hóa/thang điểm. |
| `src/services/stepGradingService.ts` | Phân biệt gián đoạn chưa có HTTP, HTTP 500/504, quota và lỗi backend; không tự gửi lại POST chưa biết đã tới server chưa; giữ cơ chế gộp request đang chờ. |
| `src/services/gradingService.ts` | AI lỗi giữ ảnh, bài làm, phân tích, điểm đề xuất và điểm giáo viên cũ; trả số câu thực sự phân tích/chưa phân tích; gợi ý mới luôn chờ giáo viên duyệt, kể cả bài cũ được chủ động bấm chấm. |
| `src/pages/teacher/TeacherResults.tsx` | Hai nút không báo thành công giả; Firebase chưa xác nhận thì hướng dẫn Lưu lại, không chấm lại; dùng fingerprint/phản hồi đã lưu để tránh gọi lại cùng nội dung không đổi. |
| `src/types/index.ts` | Kiểu lỗi và request ID. |
| `vercel.json` | Chặn auto deployment riêng nhánh này để chờ phê duyệt. Không đổi cấu hình production. |

Không tự chấm lại bài lịch sử. Chỉ handler do giáo viên bấm mới chạy AI. Thuật toán/prompt và toàn bộ đoạn chuẩn hóa/tính điểm server đã đối chiếu nguyên văn với main, không thay đổi.

## Kiểm thử đã đạt

1. **Một lần Gemini thật**, ảnh giả PNG 23.472 bytes của bài `2(x−3)+5=3x−7`: bốn bước, lỗi đầu tiên `2x+1=3x−7` (đúng phải là `2x−1=3x−7`), hai lỗi kéo theo; điểm đề xuất 1/2. Đây là phản hồi AI thật, không phải fallback. Dùng API đang triển khai chỉ làm gateway Gemini; toàn bộ bài nộp, phân tích và điểm được ghi vào **Firestore Emulator `demo-matsuda-submit-first`**, không production. Đã xác nhận route backend không ghi Firestore.
2. Handler TeacherResults thực: nộp bài hỗn hợp có ảnh trước AI, mở Kết quả thấy đúng ảnh, AI phân tích → lưu phân tích → giáo viên duyệt 1,25 → chốt → mở lại. Tổng giữ đúng 1,75/2,5. localStorage luôn ném QuotaExceededError; bản nháp giả cũ giữ nguyên byte.
3. Sau sửa: phát lại đúng phản hồi Gemini vừa thu được để kiểm thử handler mới + Emulator, không gọi API thêm. Cả nút từng bước và toàn bài đạt; toàn bài tái sử dụng phân tích đã lưu, không tạo lời gọi AI thứ hai; lưu, đọc lại và mở lại điểm đúng. Chi tiết trong `MANUAL_AI_VERIFICATION_2026-10-23.json`.
4. `check:ai-efficiency`: Gemini giả 500/503, key thiếu, HTTP 500/504, fetch bị ngắt, quota 429, request trùng, cache theo fingerprint; đều đạt. Không gọi mạng thật.
5. `check:teacher-review-ui`: hai nút thực; lỗi AI không thay điểm duyệt/ảnh/phân tích cũ, không báo đã phân tích toàn bài giả; hai luồng Firebase chưa xác nhận đều báo cần lưu lại; AI không tự chốt bài cũ.
6. `check:review-save`, `check:submit-first-ui`, `test:strikeout` (8/8), lint và build đạt. Bộ kiểm thử đã có về đề trắc nghiệm/nộp trước AI và bảo vệ điểm vẫn đạt trong phạm vi này.

Fixture `tests/fixtures/manual-ai-observed-response-20261023.json` chỉ chứa ảnh, bài toán và đáp án giả. Không có dữ liệu học sinh, token hay API key. Các backup cũ giữ nguyên, không đưa lên GitHub.

## Giới hạn trước triển khai

- Chưa khẳng định đã loại bỏ nguyên nhân gây network suspension trên máy giáo viên. Cần giờ xảy ra/request tương ứng nếu lỗi tái xuất hiện để đối chiếu. Tài liệu Chromium: https://chromium.googlesource.com/chromium/src/+/main/net/base/net_error_list.h ; Vercel timeout trả 504: https://vercel.com/docs/errors/function_invocation_timeout .
- Chưa deploy Preview/production bản sửa. Lần Gemini thật xác minh kết nối/thuật toán đang triển khai; các nhánh lỗi mới của backend được kiểm thử với phản hồi giả ngoại tuyến. Cần phê duyệt trước triển khai bản sửa và smoke check sau triển khai.
- Chấm thủ công cần giữ trang và kết nối hoạt động trong lúc chấm. Không có worker bền vững khi đóng trình duyệt. Chống trùng gồm request đang chờ trong cùng phiên và dùng lại phản hồi theo fingerprint; không tuyên bố exactly-once giữa nhiều tab/instance sau khi kết nối bị mất trước khi nhận phản hồi.
- Giữ giới hạn Firestore 1 MiB và kiến trúc ảnh hiện có. Không thêm dịch vụ trả phí, thay API key, thang điểm, thuật toán, database hoặc Security Rules.
