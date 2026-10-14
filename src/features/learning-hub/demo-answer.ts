/** Canned reply of the prototype chat (F10 waits for BE#77/#78): the summary of the article being asked about, no AI involved. */
export type DemoArticle = { slug: string; title: string; summary: string };

export function demoAnswer(article: DemoArticle | null) {
  if (!article) {
    return { text: "Đây là câu trả lời soạn sẵn cho hỏi đáp chung, chưa kết nối AI. Mở một bài trong Learn rồi chọn “Hỏi về bài này” để xem trích đoạn từ bài đó.", source: null };
  }
  return { text: article.summary, source: { title: article.title, href: `/learn/${article.slug}` } };
}
