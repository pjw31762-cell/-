import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { surveySession, useSurveySession, type ResponseAnswer } from "@/lib/survey-session";
import { ChevronLeft, ChevronRight, AlertTriangle, UploadCloud, Check, RotateCcw, BarChart3, Download } from "lucide-react";
import ExcelJS from "exceljs";

const CONF_THRESHOLD = 0.8;

export const Route = createFileRoute("/review")({
  head: () => ({ meta: [{ title: "데이터 검수 · SatisAI" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const session = useSurveySession();
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();

  const current = session.responses[idx];
  const total = session.responses.length;
  const isLast = idx >= total - 1;

  // STEP 1 에서 정의한 questions 배열을 그대로 표시(이미 표준 순서로 생성됨)
  const orderedQuestions = session.questions;

  const lowConf = current
    ? Object.values(current.answers).filter((a) => (a?.confidence ?? 0) < CONF_THRESHOLD).length
    : 0;

  const formatAnswer = (q: typeof orderedQuestions[number], a: ResponseAnswer | undefined): string => {
    if (!a) return "";
    if (q.type === "mc" && a.type === "mc")
      return a.choiceIndex != null ? q.choices[a.choiceIndex] ?? "" : "";
    if (q.type === "scale" && a.type === "scale")
      return q.rows.map((r) => `${r}:${a.scores?.[r] ?? "-"}`).join("\n");
    if (q.type === "subj" && a.type === "subj") return a.text ?? "";
    return "";
  };

  const handleExportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("응답 데이터");
    const headers = ["번호", "출처", "검수필요", ...orderedQuestions.map((q) => q.text)];
    ws.addRow(headers);
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };

    session.responses.forEach((resp, i) => {
      const values: any[] = [i + 1, resp.source];
      const hasLow = orderedQuestions.some(
        (q) => (resp.answers[q.no]?.confidence ?? 1) < CONF_THRESHOLD,
      );
      values.push(hasLow ? "⚠ 확인 필요" : "✓ 정상");
      orderedQuestions.forEach((q) => values.push(formatAnswer(q, resp.answers[q.no])));
      const row = ws.addRow(values);

      const statusCell = row.getCell(3);
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: hasLow ? "FFFFF9C4" : "FFD1FAE5" },
      };
      statusCell.font = { color: { argb: hasLow ? "FFB45309" : "FF065F46" }, bold: true };
      statusCell.alignment = { horizontal: "center", vertical: "middle" };

      orderedQuestions.forEach((q, qi) => {
        const cell = row.getCell(4 + qi);
        cell.alignment = { wrapText: true, vertical: "top" };
        const conf = resp.answers[q.no]?.confidence ?? 1;
        if (conf < CONF_THRESHOLD) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
          cell.font = { color: { argb: "FFB45309" } };
        }
      });
    });

    // 범례
    ws.addRow([]);
    ws.addRow([]);
    ws.addRow(["[범례]"]).getCell(1).font = { bold: true };
    ws.addRow(["✓ 정상", "AI가 정확히 인식한 항목"]);
    const warnRow = ws.addRow(["⚠ 확인 필요", "AI 인식 신뢰도가 낮아 직접 확인·수정이 필요한 항목 (노란색 셀로 표시됨)"]);
    warnRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
    warnRow.getCell(1).font = { color: { argb: "FFB45309" }, bold: true };

    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 14;
    orderedQuestions.forEach((_, i) => {
      ws.getColumn(4 + i).width = 22;
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const today = new Date();
    const yyyymmdd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const name = (session.surveyName || "응답").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}_응답데이터_${yyyymmdd}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 전체 응답 기준 요약 (정상 / 검수 필요 셀 수)
  const summary = (() => {
    let ok = 0;
    let need = 0;
    for (const r of session.responses) {
      for (const a of Object.values(r.answers)) {
        if (!a) continue;
        if ((a.confidence ?? 0) >= CONF_THRESHOLD) ok++;
        else need++;
      }
    }
    return { ok, need };
  })();

  if (!session.structure || session.questions.length === 0) {
    return (
      <AppShell>
        <Empty title="설문 구조를 먼저 선택하세요" to="/structure" cta="구조 선택" />
      </AppShell>
    );
  }

  if (total === 0) {
    return (
      <AppShell>
        <Empty title="검수할 응답이 아직 없어요" to="/upload" cta="업로드하러 가기" icon />
      </AppShell>
    );
  }

  const update = (no: number, a: ResponseAnswer) =>
    surveySession.updateAnswer(current.id, no, a);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Step 2"
        title="데이터 검수"
        description="AI가 인식한 응답을 문항별로 확인·수정합니다. 신뢰도 80% 미만은 빨간색으로 표시됩니다."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={total === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" /> 응답 데이터 엑셀로 내보내기
            </button>
          <button
            onClick={() => {
              if (!current) return;
              if (!confirm(`현재 선택된 설문 "${current.source}" 응답을 삭제할까요?`)) return;
              surveySession.deleteResponse(current.id);
              setIdx((i) => Math.max(0, i - 1));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4" /> 초기화
          </button>
          </div>
        }
      />

      <div className="mb-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold">총 {total}명 인식 완료</span>
          <span className="inline-flex items-center gap-1 text-blue-600">
            <span className="h-2 w-2 rounded-full bg-blue-600" /> 정상 인식 {summary.ok}건
          </span>
          <span className="inline-flex items-center gap-1 text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-600" /> 검수 필요 {summary.need}건
          </span>
        </div>
        {summary.need > 0 && (
          <div className="mt-2 text-xs text-red-600">
            빨간색 항목은 AI가 정확히 인식하지 못했습니다. 해당 셀을 직접 확인 후 수정해 주세요.
          </div>
        )}
      </div>

      <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <button
            disabled={idx === 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> 이전
          </button>
          <div>
            <div className="font-medium">{current.source}</div>
            <div className="text-xs text-muted-foreground">
              응답 {idx + 1} / {total} · 신뢰도 낮은 항목 {lowConf}개
            </div>
          </div>
          <button
            disabled={idx >= total - 1}
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-40"
          >
            다음 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {orderedQuestions.map((q, idx2) => {
          const a = current.answers[q.no];
          const confPct = Math.round((a?.confidence ?? 0) * 100);
          const low = (a?.confidence ?? 1) < CONF_THRESHOLD;
          const tooltip = low
            ? `검수 필요 — 직접 확인 후 수정하세요 (신뢰도 ${confPct}%)`
            : `AI 인식 완료 (신뢰도 ${confPct}%)`;
          return (
            <div
              key={q.no}
              title={tooltip}
              className={`rounded-xl border p-4 ${low ? "border-red-300 bg-red-50" : "border-border bg-card"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Q{idx2 + 1} · {q.type === "mc" ? "객관식" : q.type === "scale" ? "5점 척도" : "주관식"}
                  </div>
                  <div className={`mt-0.5 text-sm font-medium ${low ? "text-red-700" : "text-blue-700"}`}>
                    {q.text}
                  </div>
                </div>
                {a && (
                  <span className={`text-[10px] ${low ? "text-red-600" : "text-blue-600"}`}>
                    신뢰도 {confPct}%
                  </span>
                )}
                {low && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-medium text-red-600">
                    <AlertTriangle className="h-3 w-3" /> 검수 필요
                  </span>
                )}
              </div>

              {q.type === "mc" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {q.choices.map((c, i) => {
                    const active = (a as any)?.choiceIndex === i;
                    return (
                      <button
                        key={i}
                        onClick={() => update(q.no, { type: "mc", choiceIndex: i, confidence: 1 })}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:border-primary/40"
                        }`}
                      >
                        {i + 1}. {c}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "scale" && (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="py-1.5 text-left font-medium">평가 항목</th>
                        {["매우그렇다(5)", "그렇다(4)", "보통(3)", "그렇지않다(2)", "매우그렇지않다(1)"].map((h) => (
                          <th key={h} className="px-1 py-1.5 text-center font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {q.rows.map((row) => {
                        const cur = (a as any)?.scores?.[row] ?? null;
                        return (
                          <tr key={row} className="border-t border-border">
                            <td className="py-2 pr-2 font-medium">{row}</td>
                            {[5, 4, 3, 2, 1].map((n) => {
                              const active = cur === n;
                              return (
                                <td key={n} className="px-1 py-1 text-center">
                                  <button
                                    onClick={() => {
                                      const prev = (a as any)?.scores ?? {};
                                      update(q.no, {
                                        type: "scale",
                                        scores: { ...prev, [row]: n },
                                        confidence: 1,
                                      });
                                    }}
                                    className={`h-7 w-7 rounded-md border text-xs ${
                                      active
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card hover:border-primary/40"
                                    }`}
                                  >
                                    {n}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {q.type === "subj" && (
                <textarea
                  value={(a as any)?.text ?? ""}
                  onChange={(e) => update(q.no, { type: "subj", text: e.target.value, confidence: 1 })}
                  rows={3}
                  placeholder="응답 내용을 입력하거나 수정하세요"
                  className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        {isLast ? (
          <button
            onClick={() => navigate({ to: "/analytics" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <BarChart3 className="h-4 w-4" /> 분석 화면으로
          </button>
        ) : (
          <button
            onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <Check className="h-4 w-4" /> 승인 후 다음
          </button>
        )}
      </div>
    </AppShell>
  );
}

function Empty({ title, to, cta, icon }: { title: string; to: string; cta: string; icon?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
      {icon && <UploadCloud className="mx-auto h-8 w-8 text-muted-foreground" />}
      <div className="mt-3 text-sm font-medium">{title}</div>
      <Link
        to={to}
        className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        {cta}
      </Link>
    </div>
  );
}