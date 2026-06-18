import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X, Trash2, ShieldAlert } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ConfirmModal } from "@/routes/settings";
import { useAuth, type AccountStatus } from "@/lib/auth-context";

export const Route = createFileRoute("/users")({
  head: () => ({ meta: [{ title: "사용자 승인 관리 · SatisAI" }] }),
  component: UsersPage,
});

const FILTERS: { key: AccountStatus | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending", label: "승인 대기" },
  { key: "approved", label: "승인됨" },
  { key: "rejected", label: "거부됨" },
];

const STATUS_BADGE: Record<AccountStatus, { label: string; className: string }> = {
  pending: { label: "승인 대기", className: "bg-amber-100 text-amber-700" },
  approved: { label: "승인됨", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "거부됨", className: "bg-rose-100 text-rose-700" },
};

function UsersPage() {
  const { currentUser, accounts, approveAccount, rejectAccount, deleteAccount } = useAuth();
  const [filter, setFilter] = useState<AccountStatus | "all">("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (currentUser?.role !== "admin") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-semibold">접근 권한이 없습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            이 페이지는 관리자만 이용할 수 있습니다.
          </p>
        </div>
      </AppShell>
    );
  }

  const rows = useMemo(() => {
    const list = filter === "all" ? accounts : accounts.filter((a) => a.status === filter);
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [accounts, filter]);

  const counts = useMemo(() => {
    const c = { all: accounts.length, pending: 0, approved: 0, rejected: 0 };
    for (const a of accounts) c[a.status]++;
    return c;
  }, [accounts]);

  const target = confirmId ? accounts.find((a) => a.id === confirmId) : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin"
        title="사용자 승인 관리"
        description="가입한 사용자를 검토하고 승인 · 거부 · 삭제할 수 있습니다."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const n = counts[f.key as keyof typeof counts];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">이름 / 이메일</th>
              <th className="px-4 py-3 text-left font-medium">소속 부서</th>
              <th className="px-4 py-3 text-left font-medium">권한</th>
              <th className="px-4 py-3 text-left font-medium">상태</th>
              <th className="px-4 py-3 text-left font-medium">신청일</th>
              <th className="px-4 py-3 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  해당하는 사용자가 없습니다.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const badge = STATUS_BADGE[a.status];
              const isSeed = a.email === "gangnamsenior@daum.net";
              const isSelf = currentUser?.id === a.id;
              return (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.dept}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${a.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                      {a.role === "admin" ? "관리자" : "사용자"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      {a.status !== "approved" && (
                        <button
                          onClick={() => {
                            approveAccount(a.id);
                            toast.success(`${a.name} 님을 승인했습니다.`);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <Check className="h-3 w-3" /> 승인
                        </button>
                      )}
                      {a.status !== "rejected" && !isSeed && (
                        <button
                          onClick={() => {
                            rejectAccount(a.id);
                            toast.success(`${a.name} 님을 거부했습니다.`);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          <X className="h-3 w-3" /> 거부
                        </button>
                      )}
                      <button
                        disabled={isSeed || isSelf}
                        title={isSeed ? "기본 관리자 계정은 삭제할 수 없습니다" : isSelf ? "현재 로그인된 계정입니다" : undefined}
                        onClick={() => setConfirmId(a.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" /> 삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmId && target && (
        <ConfirmModal
          title={`${target.name} 님의 계정을 삭제할까요?`}
          desc="삭제된 계정은 복구할 수 없습니다."
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            const r = deleteAccount(confirmId);
            setConfirmId(null);
            if (!r.ok) toast.error(r.error);
            else toast.success("계정이 삭제되었습니다.");
          }}
        />
      )}
    </AppShell>
  );
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}