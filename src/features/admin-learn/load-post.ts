import { learnAdminApi } from "./api";
import type { AdminPost, AdminVersion, WithEtag } from "./types";

export type LoadedPost = { post: WithEtag<AdminPost>; version: WithEtag<AdminVersion> | null };

/**
 * `GET /posts/{id}` (post ETag + version summaries) and the chosen version `GET /versions/{id}` (version ETag).
 * No version asked for → the newest Draft, else the newest version. Shared by the full editor and the list's quick-edit pane.
 */
export async function loadPostWithVersion(accessToken: string, postId: string, versionId: string, signal?: AbortSignal): Promise<LoadedPost> {
  const post = await learnAdminApi.getPost(accessToken, postId, signal);
  const versions = [...(post.data.versions ?? [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const pick = (versionId ? versions.find((item) => item.id === versionId) : undefined) ?? versions.find((item) => item.status === "Draft") ?? versions[0] ?? null;
  return { post, version: pick ? await learnAdminApi.getVersion(accessToken, pick.id, signal) : null };
}
