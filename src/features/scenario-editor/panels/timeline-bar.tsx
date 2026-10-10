"use client";

import type { Hazard } from "../store/model";

/**
 * Hazard activation timeline. Reads/writes only `hazards[].activationTime` (seconds), which the BE already stores.
 * The scrubber is a web preview aid: markers activating later than the scrubber time are drawn small. It does not
 * simulate fire spread or evacuation (Playtest runs in Mobile/Unity, BE#55).
 */
export function TimelineBar({ hazards, timeLimit, time, onTime, onSelect, selectedIndex }: {
  hazards: Hazard[];
  timeLimit: number | undefined;
  time: number;
  onTime: (time: number) => void;
  onSelect: (index: number) => void;
  selectedIndex: number | null;
}) {
  const latest = hazards.reduce((max, hazard) => Math.max(max, hazard.activationTime), 0);
  const span = Math.max(timeLimit ?? 0, latest, 30);
  const shown = Math.min(time, span);
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / span) * 100))}%`;
  return <div className="se-timeline" data-testid="timeline">
    <div className="se-timeline-head">
      <label htmlFor="se-time">Dòng thời gian xem trước</label>
      <output htmlFor="se-time">{Math.round(shown)} / {Math.round(span)} giây</output>
    </div>
    <div className="se-timeline-track">
      <input id="se-time" type="range" min={0} max={Math.round(span)} step={1} value={shown} onChange={(event) => onTime(Number(event.target.value))} aria-valuetext={`${Math.round(shown)} giây`} />
      <ul aria-label="Thời điểm kích hoạt nguy cơ">
        {hazards.map((hazard, index) => <li key={index} style={{ left: pct(hazard.activationTime) }}>
          <button type="button" aria-label={`${hazard.id || `Nguy cơ ${index + 1}`}, kích hoạt lúc ${Math.round(hazard.activationTime)} giây`} aria-pressed={selectedIndex === index} data-active={hazard.activationTime <= shown} onClick={() => onSelect(index)} />
        </li>)}
      </ul>
    </div>
    {hazards.length === 0 && <p className="se-note">Thêm nguy cơ rồi đặt “Kích hoạt sau” để xem trình tự xuất hiện.</p>}
  </div>;
}
