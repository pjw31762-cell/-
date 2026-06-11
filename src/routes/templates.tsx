import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { FileStack, ChevronDown, ArrowRight } from "lucide-react";
import { useSettings } from "@/lib/settings-store";
import { useAnalysisHistory, groupHistoryTemplates } from "@/lib/analysis-history";
import { surveySession, type QuestionDef } from "@/lib/survey-session";

export const Route = createFileRoute("/templates")({
  head: () => ({ meta: [{ title: "설문 템플릿 · SatisAI" }] }),
  component: Templates,
});

function Templates() {
  const settings = useSettings();
  const router = useRouter();
  const currentDept = settings.department || "";
  const history = useAnalysisHistory(currentDept);
  const [openSig, setOpenSig] = useState<string | null>(null);

  const templates = useMemo(() => groupHistoryTemplates(history), [history]);

  const handleUseTemplate = (qs: QuestionDef[], name: string) => {
    try { sessionStorage.setItem("structureFrom", "templates"); } catch {}
    if (qs && qs.length) {
      surveySession.loadFromTemplate(qs, name);
      router.navigate({ to: "/structure" });
    } else {
      // 문항 구조가 저장되지 않은 이력 — 구조 설정 화면으로 이동
      surveySession.resetForNewSurvey();
      router.navigate({ to: "/structure" });
    }
  };
  return (
    <AppShell>
      <PageHeader
        eyebrow="Library"
        title="설문 템플릿"
        description="자주 쓰는 설문지 구조를 등록해 두면 AI 매칭 정확도가 올라갑니다."
      />

      <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-slate-600">
        <div className="mb-1 font-medium text-slate-700">⚡ 이 화면은 언제 사용하나요?</div>
        <p>
          이전에 사용한 설문지 구조를 다시 사용할 때 활용하세요. 원하는 템플릿의{" "}
          <span className="font-medium">[이 구조로 분석 시작하기]</span>를 클릭하면 설문 구조 설정 없이 바로{" "}
          <span className="font-medium text-emerald-700">업로드 단계</span>로 이동합니다.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          아직 분석 이력이 없습니다.
          <br />
          설문 구조 설정에서 새로 만들기를 진행하면 자동으로 등록됩니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const mc = t.questions.filter((q) => q.type === "mc");
            const scale = t.questions.filter((q) => q.type === "scale");
            const subj = t.questions.filter((q) => q.type === "subj");
            const open = openSig === t.sig;
            return (
              <div
                key={t.sig}
                className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-all hover:shadow-[var(--shadow-elevated)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
                  <FileStack className="h-5 w-5" />
                </div>
                <div className="mt-4 truncate text-sm font-semibold" title={t.name}>
                  {t.name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{currentDept}</div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>문항 {t.questions.length}개</span>
                  <span>사용 {t.count}회</span>
                </div>
                {t.questions.length > 0 && (
                  <div className="mt-2 inline-flex w-fit items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                    {t.preset === "A"
                      ? "구조 A · 표준"
                      : t.preset === "B"
                        ? "구조 B · 축약"
                        : "직접 선택 구조"}
                    <span className="text-muted-foreground">
                      · 객 {t.mc} / 척 {t.scale} / 주 {t.subj}
                    </span>
                  </div>
                )}
                {t.questions.length === 0 && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    ⚠ 문항 구조 정보가 없습니다.
                    <br />
                    동일 프로그램을 다시 분석하면 문항 구조가 자동 저장됩니다.
                  </div>
                )}
                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenSig(open ? null : t.sig)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
                    >
                      문항 확인
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(t.questions, t.name)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      이 구조로 분석 시작
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 space-y-3 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-slate-600">
                      {t.questions.length === 0 && (
                        <div className="text-slate-500">
                          문항 구조 정보가 없습니다.
                          <br />
                          해당 분석 데이터를 다시 업로드해 주세요.
                        </div>
                      )}
                      {mc.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium text-slate-700">
                            객관식 문항 ({mc.length}개)
                          </div>
                          <ul className="space-y-0.5 pl-2">
                            {mc.map((q) => (
                              <li key={q.no}>· {q.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {scale.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium text-slate-700">
                            5점 척도 문항 ({scale.length}개)
                          </div>
                          <ul className="space-y-0.5 pl-2">
                            {scale.map((q) => (
                              <li key={q.no}>
                                · {(q as Extract<QuestionDef, { type: "scale" }>).rows.join(", ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {subj.length > 0 && (
                        <div>
                          <div className="mb-1 font-medium text-slate-700">
                            주관식 문항 ({subj.length}개)
                          </div>
                          <ul className="space-y-0.5 pl-2">
                            {subj.map((q) => (
                              <li key={q.no}>· {q.text}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}