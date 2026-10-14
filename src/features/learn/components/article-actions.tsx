import { SavePostButton } from "./save-post-button";

/**
 * Actions under an article. Only "save" (real bookmark API) is offered: asking about the article needs Trainee AI,
 * which the server does not have yet (BE#77), so no ask button is shown until it can really answer.
 */
export function ArticleActions({ postId, slug }: { postId: string; slug: string }) {
  return <div className="article-actions"><SavePostButton postId={postId} slug={slug} /></div>;
}
