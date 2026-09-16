const diagrams: Record<string, Array<[string, string]>> = {
  "doc-khong-gian-truoc-khi-hanh-dong": [["Vị trí", "Xác định điểm bắt đầu trong mô hình."], ["Điểm mốc", "Quan sát cửa, cột và cầu thang."], ["Giải thích", "Ghi lại tín hiệu đã ảnh hưởng tới lựa chọn."]],
  "mot-luot-hoc-co-y-nghia": [["Làm quen", "Đọc mục tiêu và quan sát không gian."], ["Thử quyết định", "Thực hiện lựa chọn trong mô phỏng."], ["Xem lại", "So sánh lựa chọn với phản hồi của lượt tập."]],
  "tu-bai-doc-den-luot-tap": [["Bài đọc", "Lưu lại nội dung muốn tìm hiểu."], ["Câu hỏi", "Mở Góc học tập cùng ngữ cảnh bài."], ["Lượt tập", "Ứng dụng kiến thức trong hoạt động được phát hành."]],
};

export function ArticleDiagram({ slug }: { slug: string }) {
  const steps = diagrams[slug];
  if (!steps) return null;
  return (
    <figure className="my-8 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5" aria-label="Sơ đồ ba bước của bài đọc">
      <figcaption className="mb-4 font-semibold">Từ nội dung đến trải nghiệm</figcaption>
      <ol className="grid list-none gap-4 p-0 sm:grid-cols-3">
        {steps.map(([title, detail], index) => <li key={title} className="min-w-0">
          <span className="mb-2 block text-sm text-[var(--ember)]">0{index + 1}{index < 2 ? " →" : ""}</span>
          <strong className="block">{title}</strong><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{detail}</p>
        </li>)}
      </ol>
      <p className="mt-4 text-xs leading-6 text-[var(--muted)]">Sơ đồ khái niệm của bản mẫu, không phải sơ đồ thoát nạn hay hướng dẫn xử lý khẩn cấp.</p>
    </figure>
  );
}
