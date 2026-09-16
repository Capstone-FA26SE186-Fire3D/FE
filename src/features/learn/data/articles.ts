import type { LearnArticle } from "../types";

export const articles: LearnArticle[] = [
  {
    slug: "doc-khong-gian-truoc-khi-hanh-dong",
    category: "Bắt đầu",
    title: "Đọc không gian trước khi hành động",
    excerpt: "Vì sao việc làm quen với một không gian giúp quyết định trong tình huống bất ngờ trở nên rõ ràng hơn.",
    readingTime: "5 phút đọc",
    source: "Nội dung sản phẩm Fire3D — bài mẫu, chưa thẩm định chuyên môn",
    date: "12.09.2026",
    body: [
      { paragraphs: ["Trong một tình huống có áp lực, chúng ta không bắt đầu bằng việc nhớ một danh sách dài. Chúng ta bắt đầu bằng việc nhận ra mình đang ở đâu, điều gì đang thay đổi và lối đi nào còn khả dụng.", "Đó là lý do Fire3D đặt không gian ở trung tâm của trải nghiệm học. Người học có thể dừng lại, nhìn quanh và tạo một bản đồ tinh thần trước khi đưa ra lựa chọn."] },
      { heading: "Một không gian tốt để tập dượt", paragraphs: ["Không gian mô phỏng cần đủ cụ thể để người học quan sát được các dấu hiệu, nhưng cũng đủ an toàn để một quyết định chưa tốt trở thành dữ liệu học tập. Mỗi cánh cửa, cầu thang và vùng ánh sáng đều góp phần tạo nên ngữ cảnh."] },
      { heading: "Từ quan sát đến chủ động", paragraphs: ["Khi đã quen với các điểm mốc, người học có thể tập trung vào điều quan trọng hơn: vì sao mình chọn hướng đó, mình đã bỏ qua tín hiệu nào và lần sau có thể làm khác đi điều gì."] },
    ],
  },
  {
    slug: "mot-luot-hoc-co-y-nghia",
    category: "Phương pháp",
    title: "Một lượt học có ý nghĩa trông như thế nào?",
    excerpt: "Từ một tình huống có nhịp độ đến vài phút nhìn lại — cấu trúc giúp trải nghiệm không biến thành bài kiểm tra thuộc lòng.",
    readingTime: "4 phút đọc",
    source: "Nội dung sản phẩm Fire3D — bài mẫu, chưa thẩm định chuyên môn",
    date: "05.09.2026",
    body: [
      { paragraphs: ["Một lượt học hiệu quả không nhất thiết phải dài. Điều quan trọng là người học biết mình đang luyện điều gì, được tự đưa ra lựa chọn và có cơ hội xem lại lựa chọn ấy trong bối cảnh rõ ràng."] },
      { heading: "Ba nhịp của trải nghiệm", paragraphs: ["Fire3D tổ chức một lượt học theo ba nhịp: làm quen không gian, thử quyết định và xem lại kết quả. Nhịp đầu tạo định hướng; nhịp giữa tạo sự tập trung; nhịp cuối biến cảm giác thành ngôn ngữ có thể chia sẻ."] },
      { heading: "Không phán xét, có phản hồi", paragraphs: ["Phản hồi nên giúp người học hiểu mối quan hệ giữa tín hiệu và quyết định, thay vì chỉ gắn nhãn đúng hoặc sai. Đây cũng là điểm AI có thể hỗ trợ khi người học đặt câu hỏi về một bài đọc hoặc một kết quả đã lưu."] },
    ],
  },
  {
    slug: "tu-bai-doc-den-luot-tap",
    category: "Góc học tập",
    title: "Từ bài đọc đến một lượt tập",
    excerpt: "Một cách nối kiến thức nền, câu hỏi và trải nghiệm mô phỏng thành dòng học liền mạch hơn.",
    readingTime: "6 phút đọc",
    source: "Nội dung sản phẩm Fire3D — bài mẫu, chưa thẩm định chuyên môn",
    date: "28.08.2026",
    body: [
      { paragraphs: ["Bài đọc công khai giúp người học có thời gian đặt câu hỏi theo nhịp của mình. Khi câu hỏi ấy gắn với một tình huống, việc chuyển sang một lượt mô phỏng sẽ tạo thêm một lớp ghi nhớ giàu ngữ cảnh."] },
      { heading: "Giữ ngữ cảnh xuyên suốt", paragraphs: ["Góc học tập lưu những bài đã đánh dấu, lịch sử hỏi đáp và các kết quả minh họa. Trong bản thử nghiệm này, dữ liệu là mẫu để bạn xem luồng sản phẩm; hệ thống thật sẽ kết nối với tài khoản và nội dung đã được tổ chức phát hành."] },
      { heading: "Cá nhân nhưng không tách rời", paragraphs: ["Một trải nghiệm cá nhân vẫn cần ngôn ngữ chung để người học, người hướng dẫn và tổ chức có thể cùng nhìn vào. Nguồn bài đọc và bản tóm tắt là những điểm neo cho cuộc trao đổi đó."] },
    ],
  },
];

export function getArticle(slug: string) {
  return articles.find((article) => article.slug === slug);
}
