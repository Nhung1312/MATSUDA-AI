# Giai đoạn 1: Chấm trắc nghiệm chữ viết tay + cộng điểm tự luận

**Trạng thái:** Bản thử nghiệm độc lập, chưa triển khai production, chưa xác minh độ chính xác OCR trên bài giấy thật.

## Mục đích
- Giáo viên nhập số câu, đáp án A/B/C/D chuẩn, tổng điểm trắc nghiệm và tự luận (tổng = 10).
- Học sinh **viết chữ cái đáp án**, không dùng phiếu tô.
- Giáo viên chấm tự luận trước, ghi điểm (ví dụ 5,5) ở vùng riêng bên cạnh bảng đáp án.
- Giáo viên chụp/quét ảnh bài giấy, khoanh vùng đáp án và vùng điểm tự luận, chạy OCR ngay trong trình duyệt.
- Giáo viên sửa mọi chữ/điểm OCR đọc sai rồi xác nhận, hệ thống cộng tổng.
- Không nhận diện tên học sinh, không lưu Firebase, không tích hợp AI trả phí, không thay đổi luồng chấm bài điện tử.

## Cách mở
- Mã nguồn riêng: `public/cham-bai-giay-giai-doan-1.html`
- Khi build Vite của nhánh này được phát hành qua HTTPS: `/cham-bai-giay-giai-doan-1.html`.
- Có thể mở trực tiếp HTML để xem giao diện hoặc chọn file ảnh. Camera từ `getUserMedia` cần HTTPS/localhost; nút chọn/chụp ảnh có thể thay thế khi trình duyệt chặn camera.

## Phụ thuộc
- Chỉ tải **Tesseract.js v6** từ jsDelivr khi bấm OCR lần đầu. Mô hình OCR tải qua internet trên thiết bị, ảnh không gửi tới server của Matsuda AI.
- Không cần Gemini key, không gọi Firebase. OCR chữ viết tay không được đảm bảo, mọi kết quả buộc giáo viên kiểm tra và xác nhận.

## Kiểm thử đã thực hiện (môi trường địa phương)
- JavaScript: phân tích cú pháp PASS.
- Chromium/Playwright với **OCR giả lập**: nhập đáp án 12 câu; chọn ảnh; vẽ hai vùng; đọc 12/12 chữ; đọc điểm 5,5; tính 8,50; xác nhận; sửa một đáp án thành sai ra 8,25; chặn tự luận vượt thang; qua bài tiếp theo; không có lỗi JS.
- Chưa kiểm thử thư viện OCR tải thực qua mạng, chưa kiểm thử chữ viết tay học sinh thực và camera điện thoại thật. Vì vậy chưa thể khẳng định độ chính xác, tốc độ, khả năng triển khai toàn trường.

## Điều kiện trước khi triển khai toàn trường
Thử trên 20–30 bài giấy thực, đa dạng chữ viết, ánh sáng, bố cục, mã đề; đối chiếu từng câu, từng điểm tự luận. Không được tự động chốt điểm khi OCR còn chưa chắc; giáo viên phải duyệt.

**An toàn thay đổi:** Chỉ bổ sung 1 file HTML tĩnh và tài liệu này trên nhánh riêng, không sửa App.tsx, Firestore rules, AI service, Billing hoặc main.
