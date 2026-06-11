import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { ClipboardCheck, Sparkles, Users, Calendar, CalendarCheck, Star, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { surveySession } from "@/lib/survey-session";
import { useSettings } from "@/lib/settings-store";
import {
  useAnalysisHistory,
  formatHistoryDate,
} from "@/lib/analysis-history";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "대시보드 · SatisAI" },
      { name: "description", content: "복지관 만족도 조사 진행 현황과 AI 분석 결과를 한눈에." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { displayName } = useAuth();
  const settings = useSettings();
  const name = settings.userName?.trim() || displayName;
  const department = settings.department;
  const history = useAnalysisHistory(department || "");
  const [showAllHistory, setShowAllHistory] = useState(false);
  type SortKey = "recent" | "oldest" | "satHigh" | "respHigh";
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const { totalPrograms, totalResponses, latestDate, thisMonthCount, sorted, hasData } = useMemo(() => {
    const totalPrograms = history.length;
    const totalResponses = history.reduce((s, h) => s + (h.responseCount || 0), 0);
    const base = [...history].sort((a, b) => (a.analyzedAt < b.analyzedAt ? 1 : -1));
    const sorted = (() => {
      switch (sortKey) {
        case "oldest":
          return [...base].reverse();
        case "satHigh":
          return [...base].sort((a, b) => (b.avgSatisfaction || 0) - (a.avgSatisfaction || 0));
        case "respHigh":
          return [...base].sort((a, b) => (b.responseCount || 0) - (a.responseCount || 0));
        case "recent":
        default:
          return base;
      }
    })();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthCount = history.filter((h) => h.analyzedAt.startsWith(ym)).length;
    return {
      totalPrograms,
      totalResponses,
      latestDate: history.reduce<string | null>(
        (acc, h) => (acc === null || h.analyzedAt > acc ? h.analyzedAt : acc),
        null,
      ),
      thisMonthCount,
      sorted,
      hasData: totalPrograms > 0,
    };
  }, [history, sortKey]);

  const stats = [
    { label: "분석 완료 프로그램 수", value: hasData ? `${totalPrograms}건` : "-", icon: ClipboardCheck },
    { label: "총 응답자 수", value: hasData ? `${totalResponses.toLocaleString()}명` : "-", icon: Users },
    { label: "최근 분석일", value: latestDate ? formatHistoryDate(latestDate) : "-", icon: Calendar },
    { label: "이번 달 분석 건수", value: hasData ? `${thisMonthCount}건` : "-", icon: CalendarCheck },
  ];

  const insights = useMemo(() => {
    const byDate = [...history].sort((a, b) =>
      a.analyzedAt < b.analyzedAt ? 1 : -1,
    );

    // 조건 1: 동일 programName 2건 이상 추세
    const nameGroups = new Map<string, typeof byDate>();
    for (const h of byDate) {
      const arr = nameGroups.get(h.programName) ?? [];
      arr.push(h);
      nameGroups.set(h.programName, arr);
    }
    let trend: string | null = null;
    let trendName: string | null = null;
    let bestRepeat: { name: string; items: typeof byDate } | null = null;
    for (const [n, items] of nameGroups) {
      if (items.length < 2) continue;
      if (!bestRepeat || items.length > bestRepeat.items.length)
        bestRepeat = { name: n, items };
    }
    if (bestRepeat) {
      const seq = [...bestRepeat.items].reverse().slice(-4);
      const last = seq[seq.length - 1];
      const prev = seq[seq.length - 2];
      const diff = last.avgSatisfaction - prev.avgSatisfaction;
      const sign = diff > 0 ? "+" : "";
      const trail = seq
        .map(
          (it) =>
            `${formatHistoryDate(it.analyzedAt)} ${it.avgSatisfaction.toFixed(2)}점`,
        )
        .join(" → ");
      trend = `${trail}\n전회 대비 ${sign}${diff.toFixed(2)}점`;
      trendName = bestRepeat.name;
    }

    // 조건 2/3: 동일 설문 구조(=highlights 라벨 집합 일치) 그룹
    const sigOf = (h: (typeof byDate)[number]) => {
      const labels = (h.reportData?.highlights ?? [])
        .map((s) => {
          const m = s.match(/^(.+?)\s+[\d.]+\s*$/);
          return (m ? m[1] : s).trim();
        })
        .filter(Boolean)
        .sort();
      return labels.length ? labels.join("|") : null;
    };
    const structGroups = new Map<string, typeof byDate>();
    for (const h of byDate) {
      const sig = sigOf(h);
      if (!sig) continue;
      if (h.avgSatisfaction <= 0) continue;
      const arr = structGroups.get(sig) ?? [];
      arr.push(h);
      structGroups.set(sig, arr);
    }
    let bestGroup: typeof byDate | null = null;
    for (const items of structGroups.values()) {
      if (items.length < 2) continue;
      if (!bestGroup || items.length > bestGroup.length) bestGroup = items;
    }
    let avgLine: string | null = null;
    let topLine: { name: string; score: number } | null = null;
    if (bestGroup) {
      const avg =
        bestGroup.reduce((s, h) => s + h.avgSatisfaction, 0) / bestGroup.length;
      avgLine = `동일 구조 프로그램 ${bestGroup.length}개 기준\n평균 만족도 ${avg.toFixed(2)}점`;
      const top = [...bestGroup].sort(
        (a, b) => b.avgSatisfaction - a.avgSatisfaction,
      )[0];
      topLine = { name: top.programName, score: top.avgSatisfaction };
    }

    return { trend, trendName, avgLine, topLine };
  }, [history]);

  const hasInsight = !!(insights.trend || insights.avgLine || insights.topLine);

  const visibleHistory = showAllHistory ? sorted : sorted.slice(0, 5);

  return (
    <AppShell>
      <PageHeader
        title={`안녕하세요, ${name}님 👋`}
        description={
          department
            ? `${department}`
            : "분석을 시작하면 여기에 누적 결과가 표시됩니다."
        }
        actions={
          hasData ? (
            <Link
              to="/survey-setup"
              onClick={() => surveySession.resetForNewSurvey()}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> 새 분석 시작
            </Link>
          ) : undefined
        }
      />

      {!hasData && (
        <div className="-mt-6 mb-10">
          <Link
            to="/survey-setup"
            onClick={() => surveySession.resetForNewSurvey()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-7 text-lg font-semibold text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90"
          >
            새 설문 분석 시작하기
          </Link>
          <p className="mt-4 text-left text-base font-bold text-primary">
            분석을 시작하면 여기에 누적 결과가 표시됩니다.
          </p>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 truncate text-2xl font-semibold tracking-tight" title={value}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <section className={`mt-10 grid grid-cols-1 gap-6 ${hasInsight ? "lg:grid-cols-3" : ""}`}>
        <div className={`${hasInsight ? "lg:col-span-2" : ""} rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">분석 이력</h2>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="recent">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="satHigh">만족도 높은순</option>
              <option value="respHigh">응답자 많은순</option>
            </select>
          </div>
          {sorted.length === 0 ? (
            <div className="mt-5 flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
              아직 분석된 설문이 없습니다.
              <br />
              위 버튼을 눌러 첫 번째 분석을 시작하세요.
            </div>
          ) : (
            <>
            <ul className="mt-5 space-y-3">
              {visibleHistory.map((h) => (
                <li
                  key={h.id}
                  className="rounded-xl border border-border bg-background p-4 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold" title={h.programName}>{h.programName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {h.dept || "—"} · 응답 {h.responseCount}건 · {formatHistoryDate(h.analyzedAt)}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-foreground">
                        평균 만족도{" "}
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{h.avgSatisfaction.toFixed(2)}</span>
                        <span className="text-muted-foreground"> / 5</span>
                      </div>
                    </div>
                    <Link
                      to="/report"
                      search={{ id: h.id }}
                      className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      보고서 보기
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {sorted.length > 5 && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAllHistory((v) => !v)}
                  className="rounded-md border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary"
                >
                  {showAllHistory ? "접기" : `더 보기 (${sorted.length - 5}건)`}
                </button>
              </div>
            )}
            </>
          )}
        </div>

        {hasInsight && (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">AI 인사이트</h3>
            </div>
            <div className="mt-5 space-y-3">
              {insights.trend && (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed text-foreground">
                  <div className="mb-1 font-medium">📈 "{insights.trendName}" 만족도 추세</div>
                  <div className="whitespace-pre-line text-muted-foreground">{insights.trend}</div>
                </div>
              )}
              {insights.avgLine && (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed text-foreground">
                  <div className="mb-1 font-medium">📊 동일 구조 평균</div>
                  <div className="whitespace-pre-line text-muted-foreground">{insights.avgLine}</div>
                </div>
              )}
              {insights.topLine && (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm leading-relaxed text-foreground">
                  <div className="mb-1 font-medium">🏆 동일 구조 중 최고</div>
                  <div className="text-muted-foreground">
                    "{insights.topLine.name}" {insights.topLine.score.toFixed(2)}점
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
