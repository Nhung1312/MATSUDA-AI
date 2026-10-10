# Matsuda AI – Bản vá phân phối điểm linh hoạt (10/10/2026)

## Phạm vi chỉnh sửa
- Nhập và lưu điểm từng câu tự do đến 4 chữ số thập phân, dấu phẩy/dấu chấm.
- Kết nối giao diện bộ chia điểm theo nhóm và theo mục tiêu.
- Phân chia chính xác tổng điểm cho đề PDF và đề dạng câu hỏi.
- Lưu `Assignment.totalPoints` trùng tổng thực tế, không làm thay đổi đề cũ.
- Bài giao mới có `totalPoints` tùy chỉnh chấm theo thang mới; bài cũ vẫn theo thang 10.
- Hiển thị kết quả giáo viên/học sinh theo `maxScore` phù hợp, chỉnh sửa điểm giáo viên có `step=any`.

## Kiểm tra đã chạy
- `npm run test:points` (trong môi trường có cài TypeScript): PASS 25 assertions.
- Kiểm tra cú pháp TypeScript/TSX của 6 file thay đổi: PASS.
- `npm run lint`: KHÔNG ĐÁNH GIÁ được vì dự án ZIP không chứa `node_modules`, nên TypeScript báo thiếu React/Express/Firebase.
- `npm run build`: KHÔNG CHẠY được vì chưa cài thư viện; quá trình `npm install` bị timeout trong môi trường kiểm tra.
- Chưa kiểm thử thủ công trên giao diện trình duyệt, chưa kết nối cloud.

## Sau khi nhận bản ZIP
1. Giữ bản dự phòng trước khi cập nhật GitHub hoặc Google AI Studio.
2. Cài thư viện theo `package.json` với `npm install` nếu môi trường chưa có `node_modules`.
3. Chạy `npm run test:points`, `npm run lint`, rồi `npm run build` một lần.
4. Kiểm tra chức năng sửa đề cũ, tạo đề mới, PDF và nộp/chấm bài thử trước khi triển khai cho lớp.

Không có thao tác sync GitHub hay sửa dữ liệu trực tuyến trong quá trình tạo bản vá.