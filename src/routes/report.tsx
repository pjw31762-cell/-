import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import {
  useAnalysisHistory,
  formatHistoryDate,
} from "@/lib/analysis-history";
import { useSettings } from "@/lib/settings-store";
import {
  ReportDocument,
  buildReportModel,
  generateAnalysisResult,
  generateSuggestions,
  type ReportEdits,
} from "@/components/report/ReportDocument";
import { exportDocx, exportHtml } from "@/components/report/exporters";
import {
  ArrowLeft, Sparkles, FileText, FileDown, RefreshCw, Pencil,
} from "lucide-react";

export const Route = createFileRoute("/report")({
  head: () => ({ meta: [{ title: "보고서 초안 · SatisAI" }] }),
  component: ReportPage,
});

function ReportPage() {
  const settings = useSettings();
  const dept = settings.department || "";
  const history = useAnalysisHistory(dept);

  const currentYear = new Date().getFullYear();

  const [phase, setPhase] = useState<1 | 2>(1);
  const [surveyName, setSurveyName] = useState("OOO 사업");
  const [reportYear, setReportYear] = useState(String(currentYear));
  const [period, setPeriod] = useState(`${currentYear}년 1월~12월`);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<ReportEdits>({});
  const [resultText, setResultText] = useState("");
  const [suggestionText, setSuggestionText] = useState("");

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) =>
      a.analyzedAt < b.analyzedAt ? 1 : a.analyzedAt > b.analyzedAt ? -1 : 0,
    ),
    [history],
  );

  const selectedItems = useMemo(
    () => sortedHistory.filter((h) => selectedIds[h.id]),
    [sortedHistory, selectedIds],
  );
  const totalResp = selectedItems.reduce((s, h) => s + h.responseCount, 0);

  const model = useMemo(
    () => buildReportModel({
      surveyName, department: dept, period, reportYear,
      selected: selectedItems,
    }),
    [surveyName, dept, period, reportYear, selectedItems],
  );

  // Phase 2 진입 시 총평 자동 생성
  useEffect(() => {
    if (phase === 2) {
      setResultText(generateAnalysisResult(model));
      setSuggestionText(generateSuggestions(model));
      setEdits({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleGenerate = () => {
    if (!selectedItems.length) return;
    setPhase(2);
  };

  if (phase === 2) {
    return (
      <AppShell>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setPhase(1)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Phase 1으로 돌아가기
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportDocx({ reportYear, surveyName })}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <FileText className="h-4 w-4" /> 문서 파일 (DOCX)
            </button>
            <button
              onClick={() => exportHtml({ reportYear, surveyName })}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <FileDown className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-soft)] space-y-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
            <Pencil className="h-3.5 w-3.5" />
            각 항목을 클릭하면 직접 수정할 수 있습니다.
          </div>

          <ReportDocument
            model={model}
            edits={edits}
            onEdit={(id: string, next: string) =>
              setEdits((p) => ({ ...p, [id]: next }))}
            resultText={resultText}
            onResultChange={setResultText}
            suggestionText={suggestionText}
            onSuggestionChange={setSuggestionText}
          />

          <div className="border-t border-border pt-4 flex justify-end">
            <button
              onClick={() => setSuggestionText(generateSuggestions(model))}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" /> 제언 다시 생성
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Step 4"
        title="만족도 분석 보고서"
        description="기본 정보와 취합할 세부사업을 선택한 뒤 AI 보고서 초안을 생성하세요."
      />

      <div className="space-y-6">
        {/* 기본 정보 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] space-y-4">
          <h3 className="font-semibold text-sm">기본 정보</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="사업명">
              <input
                value={surveyName}
                onChange={(e) => setSurveyName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="담당 부서">
              <input
                value={dept || "—"}
                readOnly
                className="w-full rounded-md border border-input bg-secondary/30 px-3 py-2 text-sm text-muted-foreground"
              />
            </Field>
            <Field label="조사 기간">
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="보고서 연도">
              <input
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </div>

        {/* 세부사업 선택 */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] space-y-3">
          <div>
            <h3 className="font-semibold text-sm">취합할 세부사업을 선택하세요</h3>
            <p className="text-xs text-muted-foreground mt-1">
              선택한 세부사업의 분석 결과가 보고서에 취합되어 반영됩니다.
            </p>
          </div>

          {sortedHistory.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                분석된 세부사업이 없습니다.<br />
                응답 항목 분석을 먼저 완료해 주세요.
              </p>
              <Link
                to="/analytics"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                응답 항목 분석으로 이동
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                {sortedHistory.map((h) => {
                  const checked = !!selectedIds[h.id];
                  return (
                    <li key={h.id}>
                      <label className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedIds((p) => ({ ...p, [h.id]: e.target.checked }))
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <span className="flex-1 text-sm font-medium">{h.programName}</span>
                        <span className="text-xs text-muted-foreground">
                          응답 {h.responseCount}명
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
                          {formatHistoryDate(h.analyzedAt)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground pt-1">
                선택된 세부사업 <b className="text-foreground">{selectedItems.length}개</b> · 총 응답자 <b className="text-foreground">{totalResp}명</b>
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={selectedItems.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90 disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> AI 보고서 초안 생성하기 →
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}