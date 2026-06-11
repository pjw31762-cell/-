import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { FileStack, Plus } from "lucide-react";
import { useSettings } from "@/lib/settings-store";
import { surveySession } from "@/lib/survey-session";
import { useAnalysisHistory } from "@/lib/analysis-history";

export const Route = createFileRoute("/survey-setup")({
  head: () => ({ meta: [{ title: "설문 구조 설정 · SatisAI" }] }),
  component: SurveySetupPage,
});

function SurveySetupPage() {
  const settings = useSettings();
  const currentDept = settings.department;
  const history = useAnalysisHistory(currentDept || "");
  const historyTemplateCount = (() => {
    const sigs = new Set<string>();
    for (const h of history) {
      const qs = h.reportData?.questions;
      const sig = qs && qs.length
        ? qs.map((q) => `${q.type}:${q.text}`).join("|")
        : `__legacy__${h.programName}`;
      sigs.add(sig);
    }
    return sigs.size;
  })();
  const savedTemplateCount = settings.templates.filter(
    (t) => !currentDept || !t.dept || t.dept === currentDept,
  ).length;
  const templateCount = historyTemplateCount + savedTemplateCount;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Setup"
        title="어떻게 시작할까요?"
        description="설문지 구조를 설정하거나 저장된 템플릿을 불러올 수 있습니다."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 새로 만들기 */}
        <Link
          to="/structure"
          onClick={() => {
            try { sessionStorage.removeItem("structureFrom"); } catch {}
            surveySession.resetForNewSurvey();
          }}
          className="group flex flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
            <Plus className="h-6 w-6" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">새로 만들기</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            문항을 처음부터 직접 설정합니다
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            (첫 사용 시 추천)
          </p>
        </Link>

        {/* 템플릿 사용 */}
        {templateCount > 0 ? (
          <Link
            to="/templates"
            className="group flex flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-accent-foreground">
              <FileStack className="h-6 w-6" />
            </div>
            <h3 className="mt-6 text-lg font-semibold">템플릿 사용</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              이전에 저장한 구조를 바로 사용합니다
            </p>
            <p className="mt-1 text-xs text-primary font-medium">
              템플릿 {templateCount}개
            </p>
          </Link>
        ) : (
          <div className="flex flex-col rounded-2xl border border-border bg-card p-8 opacity-60 cursor-not-allowed">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <FileStack className="h-6 w-6" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-muted-foreground">템플릿 사용</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              이전에 저장한 구조를 바로 사용합니다
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              저장된 템플릿이 없습니다
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
