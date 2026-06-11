import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useAuth, type AccountStatus } from "@/lib/auth-context";
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  UserCog,
  Users,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "사용자 승인 관리 · SatisAI" },
      { name: "description", content: "관리자가 가입 신청한 사용자를 승인·관리합니다." },
    ],
  }),
  component: UsersPage,
});

const STATUS_META: Record<AccountStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: "승인 대기", cls: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "승인됨", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "거부됨", cls: "bg-rose-100 text-rose-700", icon: XCircle },
};

function fmt(ts: number) {
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function UsersPage() {
  const { isAdmin, accounts, approveUser, rejectUser, deleteUser, currentUser } = useAuth();
  const [filter, setFilter] = useState<"all" | AccountStatus>("all");

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">접근 권한이 없습니다</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            사용자 승인 관리는 관리자만 이용할 수 있습니다.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> 대시보드로 돌아가기
          </Link>
        </div>
      </AppShell>
    );
  }

  const pending = accounts.filter((a) => a.status === "pending");
  const sorted = [...accounts].sort((a, b) => b.createdAt - a.createdAt);
  const visible = filter === "all" ? sorted : sorted.filter((a) => a.status === filter);

  const handleApprove = (id: string, name: string) => {
    approveUser(id);
    toast.success(`${name} 님을 승인했습니다.`);
  };
  const handleReject = (id: string, name: string) => {
    rejectUser(id);
    toast(`${name} 님의 접속을 거부했습니다.`);
  };
  const handleDelete = (id: string, name: string) => {
    if (!confirm(`${name} 님의 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteUser(id);
    toast(`${name} 님의 계정을 삭제했습니다.`);
  };

  const counts = {
    all: accounts.length,
    pending: accounts.filter((a) => a.status === "pending").length,
    approved: accounts.filter((a) => a.status === "approved").length,
    rejected: accounts.filter((a) => a.status === "rejected").length,
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="관리자"
        title="사용자 승인 관리"
        description="회원가입을 신청한 사용자를 승인하면 플랫폼에 접속할 수 있습니다."
      />

      {pending.length > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Clock className="h-4 w-4" />
          승인 대기 중인 신청이 <b>{pending.length}건</b> 있습니다.
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === k
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-secondary"
            }`}
          >
            {k === "all" ? "전체" : STATUS_META[k].label} ({counts[k]})
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50 text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">이름 / 이메일</th>
              <th className="px-4 py-3 font-medium">소속</th>
              <th className="px-4 py-3 font-medium">권한</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">신청일</th>
              <th className="px-4 py-3 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  해당하는 사용자가 없습니다.
                </td>
              </tr>
            )}
            {visible.map((a) => {
              const meta = STATUS_META[a.status];
              const StatusIcon = meta.icon;
              const isSelf = a.id === currentUser?.id;
              return (
                <tr key={a.id} className="border-t border-border align-middle">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {a.name}
                      {isSelf && <span className="ml-1 text-[11px] text-muted-foreground">(나)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.dept}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        a.role === "admin" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {a.role === "admin" ? <UserCog className="h-3 w-3" /> : null}
                      {a.role === "admin" ? "관리자" : "사용자"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                    >
                      <StatusIcon className="h-3 w-3" /> {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-3">
                    {a.role === "admin" ? (
                      <div className="text-right text-xs text-muted-foreground">—</div>
                    ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        {a.status !== "approved" && (
                          <button
                            onClick={() => handleApprove(a.id, a.name)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> 승인
                          </button>
                        )}
                        {a.status !== "rejected" && (
                          <button
                            onClick={() => handleReject(a.id, a.name)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <XCircle className="h-3.5 w-3.5" /> 거부
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(a.id, a.name)}
                          className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                          aria-label="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
