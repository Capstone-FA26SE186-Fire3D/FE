import Image from "next/image";
import Link from "next/link";
import { Iconsax } from "@/components/ui/iconsax";
import { articles } from "../data/articles";

export function RelatedArticles({ currentSlug }: { currentSlug: string }) {
  const related = articles.filter((article) => article.slug !== currentSlug);
  if (!related.length) return null;
  return <aside className="reader-related" aria-labelledby="reader-related-heading">
    <h2 id="reader-related-heading">Đọc tiếp</h2>
    <p className="reader-related-note">Bài mẫu trong thư viện Learn</p>
    <ul>{related.map((article) => <li key={article.slug}>
      <Link className="reader-related-link" href={`/learn/${article.slug}`}>
        <span className={`reader-related-cover cover-${article.slug}`}>
          {article.cover ? <Image src={article.cover} alt="" fill sizes="80px" /> : <Iconsax name="buildings" size={30} />}
        </span>
        <span className="reader-related-copy"><strong>{article.title}</strong><span>{article.date}</span></span>
      </Link>
    </li>)}</ul>
    <Link className="reader-related-all" href="/learn">Xem thư viện Learn <span aria-hidden="true">↗</span></Link>
  </aside>;
}
