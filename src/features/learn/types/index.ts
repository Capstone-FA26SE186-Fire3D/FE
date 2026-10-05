export type LearnArticle = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readingTime: string;
  source: string;
  date: string;
  author?: string;
  cover?: string;
  body: Array<{ heading?: string; paragraphs: string[] }>;
};
