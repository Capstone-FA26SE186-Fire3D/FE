/**
 * Error codes and ids are for whoever investigates a problem, not for the person using the page: they stay out of the
 * message and sit in a folded line the user can copy into a support request.
 */
export function SupportCode({ code, id }: { code?: string; id?: string }) {
  if (!code && !id) return null;
  return <details className="support-code">
    <summary>Thông tin cho bộ phận hỗ trợ</summary>
    {code && <span>Mã: <code data-testid="support-code">{code}</code></span>}
    {id && <span>Định danh: <code>{id}</code></span>}
  </details>;
}
