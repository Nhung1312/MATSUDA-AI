export interface MathTopic {
  id: string;
  name: string;
  category: 'algebra' | 'geometry' | 'statistics';
  grade: '6' | '7' | '8' | '9';
  recommendedQuestions?: number;
}

export const CURRICULUM_MATH_TOPICS: Record<'6' | '7' | '8' | '9', MathTopic[]> = {
  '6': [
    { id: 't6_1', name: 'Tập hợp số tự nhiên & Phép chia hết', category: 'algebra', grade: '6' },
    { id: 't6_2', name: 'Số nguyên & Phép tính cộng, trừ, nhân, chia số nguyên', category: 'algebra', grade: '6' },
    { id: 't6_3', name: 'Phân số: Rút gọn, so sánh & Các phép tính', category: 'algebra', grade: '6' },
    { id: 't6_4', name: 'Số thập phân, tỉ số & Tỉ số phần trăm', category: 'algebra', grade: '6' },
    { id: 't6_5', name: 'Hình học trực quan: Tam giác đều, hình vuông, lục giác đều', category: 'geometry', grade: '6' },
    { id: 't6_6', name: 'Hình bình hành, hình thoi & Hình thang cân', category: 'geometry', grade: '6' },
    { id: 't6_7', name: 'Chu vi & Diện tích các hình phẳng trong thực tiễn', category: 'geometry', grade: '6' },
    { id: 't6_8', name: 'Hình có trục đối xứng & Tâm đối xứng', category: 'geometry', grade: '6' },
    { id: 't6_9', name: 'Thu thập dữ liệu, bảng số liệu & Biểu đồ tranh, biểu đồ cột', category: 'statistics', grade: '6' },
    { id: 't6_10', name: 'Xác suất thực nghiệm trong các trò chơi đơn giản', category: 'statistics', grade: '6' }
  ],
  '7': [
    { id: 't7_1', name: 'Số hữu tỉ & Các phép tính số hữu tỉ', category: 'algebra', grade: '7' },
    { id: 't7_2', name: 'Số thực, Căn bậc hai số học & Số vô tỉ', category: 'algebra', grade: '7' },
    { id: 't7_3', name: 'Tỉ lệ thức & Dãy tỉ số bằng nhau', category: 'algebra', grade: '7' },
    { id: 't7_4', name: 'Đại lượng tỉ lệ thuận & Tỉ lệ nghịch', category: 'algebra', grade: '7' },
    { id: 't7_5', name: 'Biểu thức đại số & Đa thức một biến', category: 'algebra', grade: '7' },
    { id: 't7_6', name: 'Góc ở vị trí đặc biệt & Hai đường thẳng song song', category: 'geometry', grade: '7' },
    { id: 't7_7', name: 'Định lý & Chứng minh định lý hình học', category: 'geometry', grade: '7' },
    { id: 't7_8', name: 'Tam giác bằng nhau (c-c-c, c-g-c, g-c-g) & Tam giác vuông', category: 'geometry', grade: '7' },
    { id: 't7_9', name: 'Tam giác cân, đường trung trực & Định lý Pythagore', category: 'geometry', grade: '7' },
    { id: 't7_10', name: 'Biểu đồ đoạn thẳng, biểu đồ hình quạt tròn & Xác suất biến cố', category: 'statistics', grade: '7' }
  ],
  '8': [
    { id: 't8_1', name: 'Đa thức nhiều biến (Cộng, trừ, nhân, chia đơn/đa thức)', category: 'algebra', grade: '8' },
    { id: 't8_2', name: '7 Hằng đẳng thức đáng nhớ & Ứng dụng', category: 'algebra', grade: '8' },
    { id: 't8_3', name: 'Phân tích đa thức thành nhân tử', category: 'algebra', grade: '8' },
    { id: 't8_4', name: 'Phân thức đại số: Rút gọn & Các phép biến đổi', category: 'algebra', grade: '8' },
    { id: 't8_5', name: 'Phương trình bậc nhất một ẩn & Giải bài toán thực tế', category: 'algebra', grade: '8' },
    { id: 't8_6', name: 'Hàm số bậc nhất y = ax + b & Đồ thị hàm số', category: 'algebra', grade: '8' },
    { id: 't8_7', name: 'Tứ giác: Hình thang cân, hình bình hành, hình chữ nhật', category: 'geometry', grade: '8' },
    { id: 't8_8', name: 'Hình thoi, hình vuông & Trọng tâm tam giác', category: 'geometry', grade: '8' },
    { id: 't8_9', name: 'Định lý Thalès trong tam giác & Đường trung bình', category: 'geometry', grade: '8' },
    { id: 't8_10', name: 'Tam giác đồng dạng & Các trường hợp đồng dạng', category: 'geometry', grade: '8' },
    { id: 't8_11', name: 'Hình chóp tam giác đều & Hình chóp tứ giác đều', category: 'geometry', grade: '8' },
    { id: 't8_12', name: 'Thu thập, xử lý dữ liệu & Bảng tần số, biểu đồ', category: 'statistics', grade: '8' }
  ],
  '9': [
    { id: 't9_1', name: 'Phương trình & Hệ hai phương trình bậc nhất hai ẩn', category: 'algebra', grade: '9' },
    { id: 't9_2', name: 'Phương trình bậc hai một ẩn & Định lý Viète', category: 'algebra', grade: '9' },
    { id: 't9_3', name: 'Căn bậc hai, căn bậc ba & Rút gọn biểu thức chứa căn', category: 'algebra', grade: '9' },
    { id: 't9_4', name: 'Hàm số y = ax² (a ≠ 0) & Đồ thị Parabol', category: 'algebra', grade: '9' },
    { id: 't9_5', name: 'Giải bài toán bằng cách lập hệ phương trình / phương trình', category: 'algebra', grade: '9' },
    { id: 't9_6', name: 'Hệ thức lượng trong tam giác vuông & Tỉ số lượng giác', category: 'geometry', grade: '9' },
    { id: 't9_7', name: 'Đường tròn: Dây cung, tiếp tuyến & Vị trí tương đối', category: 'geometry', grade: '9' },
    { id: 't9_8', name: 'Góc với đường tròn: Góc ở tâm, góc nội tiếp, góc tạo bởi tiếp tuyến và dây', category: 'geometry', grade: '9' },
    { id: 't9_9', name: 'Tứ giác nội tiếp đường tròn & Các bài toán chứng minh', category: 'geometry', grade: '9' },
    { id: 't9_10', name: 'Hình trụ, hình nón, hình cầu (Diện tích & Thể tích)', category: 'geometry', grade: '9' },
    { id: 't9_11', name: 'Bất đẳng thức & Bài toán tìm GTLN, GTNN (Vận dụng cao)', category: 'algebra', grade: '9' },
    { id: 't9_12', name: 'Tần số, bảng phân bố tần số & Xác suất thực nghiệm nâng cao', category: 'statistics', grade: '9' }
  ]
};
