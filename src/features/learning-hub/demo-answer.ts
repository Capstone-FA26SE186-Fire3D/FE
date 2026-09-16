import { articles, getArticle } from "@/features/learn/data/articles";

export function demoAnswer(articleSlug: string | null) {
  const article = (articleSlug && getArticle(articleSlug)) || articles[1];
  return {
    text: article.body[0].paragraphs[0],
    source: { title: article.title, href: `/learn/${article.slug}`, publisher: article.source },
  };
}
