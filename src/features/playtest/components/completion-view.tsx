function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function render(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value, null, 2);
}

/**
 * Result the Mobile/Unity runtime submitted on completion. BE returns it as an opaque JSON element without a published
 * schema, so Web shows every field exactly as received and does not interpret scores or verdicts.
 */
export function CompletionView({ completion }: { completion: unknown }) {
  if (completion === null || completion === undefined) {
    return <p className="ver-note">Máy chủ chưa trả kết quả cho playtest này.</p>;
  }
  const entries = isRecord(completion) ? Object.entries(completion) : [["Kết quả", completion] as [string, unknown]];
  if (entries.length === 0) return <p className="ver-note">Mobile hoàn tất nhưng không gửi nội dung tóm tắt.</p>;
  return <dl className="ver-dl" data-testid="playtest-completion">
    {entries.map(([name, value]) => {
      const text = render(value);
      return <div key={name} style={{ display: "contents" }}>
        <dt>{name}</dt>
        <dd>{text.includes("\n") ? <pre className="ver-code">{text}</pre> : text}</dd>
      </div>;
    })}
  </dl>;
}
