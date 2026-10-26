"use client";

import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";
import { KIND_ART, KIND_ART_SIZE } from "../kind-art";
import { embedUrl, videoPoster, type VideoProvider } from "../safe-url";

/**
 * A video block that plays in the article. Until the reader presses play it is only a still frame: no player, cookie or
 * script from the provider loads (privacy and page weight). Then an allowlisted iframe replaces the frame. The summary and
 * the link to the provider stay under it, for a video that is private, removed or blocked from embedding.
 */
export function VideoEmbed({ provider, videoId, url, fallbackSummary }: { provider: VideoProvider; videoId: string; url: string; fallbackSummary: string }) {
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const src = embedUrl(provider, videoId, url);
  const poster = posterFailed ? null : videoPoster(provider, videoId);
  return <div className="learn-video lv2-video" data-provider={provider} data-testid="video-fallback">
    <div className="lv2-video-frame" data-portrait={provider === "TikTok" || undefined}>
      {playing && src
        ? <iframe src={src} title={`Video trên ${provider}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" loading="lazy" data-testid="video-player" />
        : <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster ? <img src={poster} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setPosterFailed(true)} />
            // eslint-disable-next-line @next/next/no-img-element
            : <img className="learn-cover-art" src={KIND_ART.Video} alt="" width={KIND_ART_SIZE.width} height={KIND_ART_SIZE.height} loading="lazy" decoding="async" />}
          {src && <button type="button" className="lv2-video-play" onClick={() => setPlaying(true)} aria-label={`Phát video trên ${provider} ngay trong bài`}><Play size={24} aria-hidden="true" /></button>}
        </>}
    </div>
    <div className="lv2-video-foot">
      <div><strong>Video trên {provider}</strong>{fallbackSummary && <p className="learn-text">{fallbackSummary}</p>}</div>
      <a className="learn-video-link" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />Xem video trên {provider}<span className="sr-only"> (mở trong tab mới)</span></a>
    </div>
  </div>;
}
