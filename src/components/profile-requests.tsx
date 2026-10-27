import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { listUserRequests } from "@/lib/api";

export function ProfileRequests({ userId, title = "История заявок" }: { userId: string; title?: string }) {
  const q = useQuery({ queryKey: ["user-requests", userId], queryFn: () => listUserRequests(userId) });
  const rows = q.data ?? [];
  return (
    <section className="glass-panel mb-6 rounded-2xl p-6">
      <h2 className="text-base font-semibold text-ink">{title} · {rows.length}</h2>
      {q.isLoading ? (
        <p className="mt-4 text-sm text-dim">Загружаем…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-dim">Заявок пока нет.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-dim">
                {r.kind === "buy" ? "Покупка" : "Продажа"}
              </span>
              <Link to="/requests" className="min-w-0 flex-1 truncate text-ink hover:text-brand">{r.title}</Link>
              <span className="font-mono text-xs text-dim">{new Date(r.created_at).toLocaleDateString("ru-RU")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
