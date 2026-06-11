import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, ScanLine, ClipboardCheck, BarChart3, FileText, Settings, ListChecks, LogOut, Sun, Moon, FolderOpen, ChevronLeft, UserCog } from "lucide-react";
import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useSettings } from "@/lib/settings-store";
import { surveySession } from "@/lib/survey-session";
import { useTheme, themeStore } from "@/lib/theme";

const navGroups = [
  {
    label: "",
    items: [{ to: "/", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "분석 준비",
    items: [
      {
        to: "/survey-setup",
        label: "설문 구조 설정",
        icon: ListChecks,
        children: [
          { to: "/templates", label: "템플릿 사용", icon: FolderOpen },
        ],
      },
    ],
  },
  {
    label: "분석 진행",
    items: [
      { to: "/upload", label: "AI 스캔 업로드", icon: ScanLine },
      { to: "/review", label: "데이터 검수", icon: ClipboardCheck },
      { to: "/analytics", label: "응답 항목 분석", icon: BarChart3 },
    ],
  },
  {
    label: "결과",
    items: [{ to: "/report", label: "보고서 초안", icon: FileText }],
  },
] as const;

// 작업 흐름 순서 — 페이지 상단 이전/다음 버튼이 이 순서를 따라간다.
const FLOW: { to: string; label: string }[] = [
  { to: "/", label: "대시보드" },
  { to: "/survey-setup", label: "설문 구조 설정" },
  { to: "/structure", label: "설문 구조 선택" },
  { to: "/upload", label: "AI 스캔 업로드" },
  { to: "/review", label: "데이터 검수" },
  { to: "/analytics", label: "응답 항목 분석" },
  { to: "/report", label: "보고서 초안" },
];

function PageNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const idx = FLOW.findIndex((f) => f.to === pathname);
  if (idx === -1) return null;
  let prev = idx > 0 ? FLOW[idx - 1] : null;
  // /structure 화면에서 템플릿 사용으로부터 진입한 경우 [이전] → /templates
  if (pathname === "/structure" && typeof window !== "undefined") {
    const from = sessionStorage.getItem("structureFrom");
    if (from === "templates") {
      prev = { to: "/templates", label: "템플릿 사용" };
    }
  }
  return (
    <div className="mb-6 flex items-center justify-between gap-2">
      {prev ? (
        <button
          type="button"
          onClick={() => {
            if (prev && prev.to !== "/structure") {
              try { sessionStorage.removeItem("structureFrom"); } catch {}
            }
            router.navigate({ to: prev!.to });
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
          이전 · {prev.label}
        </button>
      ) : <span />}
      <span />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { displayName, signOut, isAdmin, pendingCount } = useAuth();
  const settings = useSettings();
  const department = settings.department;
  const name = settings.userName?.trim() || displayName;
  const roleLabel = isAdmin ? "관리자" : "사용자";
  const theme = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-soft)]">
            <ScanLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight">스마트 웰 서베이</span>
              <span className="text-[10px] text-muted-foreground">Smart Well-Survey</span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
              강남시니어플라자 만족도 자동화 플랫폼
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {navGroups.map((group, gIdx) => (
            <div key={group.label ?? `group-${gIdx}`}>
              {group.label && (
                <div className="mt-4 mb-1 px-3">
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
                    <span className="text-xs text-slate-400 font-medium">{group.label}</span>
                  </div>
                </div>
              )}
              {group.items.map((item) => {
                const { to, label, icon: Icon } = item;
                const children = (item as { children?: { to: string; label: string; icon: typeof Icon }[] }).children;
                const active = to === "/" ? pathname === "/" : pathname === to;
                return (
                  <div key={to}>
                    <Link
                      to={to}
                      onClick={() => {
                        if (to === "/survey-setup") surveySession.resetForNewSurvey();
                      }}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                        active
                          ? "bg-primary-soft text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                    {children?.map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = pathname.startsWith(child.to);
                      return (
                        <Link
                          key={child.to}
                          to={child.to}
                          className={`mt-0.5 flex items-center gap-2 rounded-lg pl-6 pr-3 py-2 text-sm transition-all ${
                            childActive
                              ? "text-indigo-600 font-medium"
                              : "text-slate-500 hover:text-indigo-600"
                          }`}
                        >
                          <span className="text-xs">└</span>
                          <ChildIcon className="h-3.5 w-3.5" />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          {isAdmin && (
            <div>
              <div className="mt-4 mb-1 px-3">
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="text-xs text-slate-400 font-medium">관리자</span>
                </div>
              </div>
              <Link
                to="/users"
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  pathname === "/users"
                    ? "bg-primary-soft text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <UserCog className="h-4 w-4" />
                <span className="flex-1">사용자 승인 관리</span>
                {pendingCount > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            </div>
          )}
        </nav>
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={() => themeStore.set(isDark ? "light" : "dark")}
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
            title="테마 전환"
            aria-label="테마 전환"
          >
            <span className="inline-flex items-center gap-1.5">
              <Sun className="h-3.5 w-3.5" /> 라이트
            </span>
            <span
              className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
                isDark ? "bg-primary" : "bg-secondary border border-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isDark ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Moon className="h-3.5 w-3.5" /> 다크
            </span>
          </button>
          <Link
            to="/settings"
            search={{ tab: undefined }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            <Settings className="h-4 w-4" />
            설정
          </Link>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-medium">{department || "—"}</div>
              <div className="truncate text-[11px] text-muted-foreground">{roleLabel} · {name}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
              title="로그아웃"
            >
              <LogOut className="h-3.5 w-3.5" /> 로그아웃
            </button>
          </div>
        </div>
      </aside>
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
          <PageNav />
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}