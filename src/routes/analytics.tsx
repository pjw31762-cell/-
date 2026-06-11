import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { surveySession, useSurveySession } from "@/lib/survey-session";
import { analysisHistory } from "@/lib/analysis-history";
import type { StoredAnalysis } from "@/lib/analysis-history";
import { RotateCcw, ArrowRight, Download, FileText, FileSpreadsheet, FileDown, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { draftReport } from "@/lib/ai.functions";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "응답 항목 분석 · SatisAI" }] }),
  component: Analytics,
});

const COLORS = ["#4f6bef", "#5a9fe0", "#7fb3a8", "#e8b54a", "#e85d5d", "#a78bfa", "#94a3b8"];
const TWO_COLORS = ["#4f6bef", "#e85d5d"];

const pickColors = (n: number) => (n === 2 ? TWO_COLORS : COLORS);

const sanitizeFileName = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 80) || "chart";

// 도형 안에 흰색 굵은 % 라벨
const renderPieLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (!percent) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={800}>
      {(percent * 100).toFixed(1)}%
    </text>
  );
};

// ───── 분석 문장 자동 생성 헬퍼 ─────
const fmtPct = (n: number, total: number) =>
  total ? ((n / total) * 100).toFixed(1) : "0.0";

type Counted = { name: string; value: number };

// 선택지 패턴만으로 특수 표현 적용 여부를 판단한다. 문항 텍스트는 매칭에 사용하지 않는다.
function isGenderChoices(choices: string[]) {
  if (choices.length !== 2) return false;
  return choices.every((c) => /^(남|여)(자|성)?$/.test(c.trim()));
}
function isAgeChoices(choices: string[]) {
  if (!choices.length) return false;
  return choices.every((c) => /\d+\s*대/.test(c));
}

function sortDesc(counts: Counted[]) {
  return [...counts].filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
}

function genderSentence(counts: Counted[], total: number) {
  // 여 먼저, 남 다음
  const female = counts.find((c) => /여/.test(c.name));
  const male = counts.find((c) => /남/.test(c.name));
  const parts: string[] = [];
  if (female) parts.push(`여 ${female.value}명(${fmtPct(female.value, total)}%)`);
  if (male) parts.push(`남 ${male.value}명(${fmtPct(male.value, total)}%)`);
  // fallback: 기타 선택지가 있다면 추가
  for (const c of counts) {
    if (c === female || c === male) continue;
    if (c.value > 0) parts.push(`${c.name} ${c.value}명(${fmtPct(c.value, total)}%)`);
  }
  return parts.length ? parts.join(", ") + "으로 나타남." : "응답 없음.";
}

// 객관식 공통 형식 — 문항 라벨(q.text)을 기준으로 빈도순 문장 생성.
function genericMcSentence(label: string, counts: Counted[], total: number) {
  const sorted = sortDesc(counts);
  if (!sorted.length) return "응답 없음.";
  const parts = sorted.map((c) => `'${c.name}' ${c.value}명(${fmtPct(c.value, total)}%)`);
  return `${label}을(를) 묻는 문항에 ${parts.join(", ")} 순으로 응답함.`;
}

// 연령대 선택지 전용 표현.
function ageSentence(counts: Counted[], total: number) {
  const sorted = sortDesc(counts);
  if (!sorted.length) return "응답 없음.";
  const head = sorted[0];
  const rest = sorted.slice(1).map((c) => `${c.name} ${fmtPct(c.value, total)}%`);
  let s = `${head.name}(${fmtPct(head.value, total)}%)의 비율이 가장 높`;
  if (rest.length) s += `고, 이후 ${rest.join(", ")} 순으로 나타남.`;
  else s += `게 나타남.`;
  return s;
}

function scaleSentence(rowAverages: { name: string; score: number }[]) {
  const valid = rowAverages.filter((r) => r.score > 0);
  if (!valid.length) return "응답 없음.";
  // 점수별 그룹화
  const groups = new Map<string, string[]>();
  for (const r of valid) {
    const key = r.score.toFixed(1);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r.name);
  }
  const ranked = [...groups.entries()]
    .map(([k, names]) => ({ score: Number(k), names }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];
  const third = ranked[2];
  const topNames = top.names.map((n) => `'${n}'`).join(", ");
  let s = `세부 만족도조사 결과 ${topNames}이 평균 ${top.score.toFixed(1)}점으로 가장 높았고`;
  const tail: string[] = [];
  if (second) {
    const names = second.names.map((n) => `'${n}'`).join(" 및 ");
    tail.push(`${names} 평균 ${second.score.toFixed(1)}점`);
  }
  if (third) {
    const names = third.names.map((n) => `'${n}'`).join(" 및 ");
    tail.push(`${names} 평균 ${third.score.toFixed(1)}점`);
  }
  if (tail.length) s += `, 이후 ${tail.join(", ")} 순으로 나타남.`;
  else s += `.`;
  const overall = valid.reduce((sum, r) => sum + r.score, 0) / valid.length;
  s += ` ${valid.length}개 항목 평균 ${overall.toFixed(1)}점의 만족도가 나타남.`;
  return s;
}

function subjectiveList(texts: string[]) {
  const map = new Map<string, number>();
  for (const t of texts) {
    const k = t.trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => (n > 1 ? `${t} (${n}건)` : t));
}

// 주관식 공통 요약 — 문항 라벨 기준으로 키워드 빈도 정리.
function genericSubjSentence(label: string, texts: string[]) {
  const n = texts.length;
  if (n === 0) return `${label} 관련 응답이 없습니다.`;
  const wordMap = new Map<string, number>();
  for (const t of texts) {
    for (const w of t.split(/[\s,.!?·…\-/()]+/).filter((w) => w.length >= 2)) {
      wordMap.set(w, (wordMap.get(w) ?? 0) + 1);
    }
  }
  const keywords = [...wordMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => `'${e[0]}'`)
    .join(", ");
  const kwPart = keywords ? ` 주요 언급 키워드: ${keywords}.` : "";
  return `${label} 관련 응답 총 ${n}건이 수집됨.${kwPart}`;
}

function Analytics() {
  const session = useSurveySession();
  const chartRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [summaryText, setSummaryText] = useState<string>("");
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const draftReportFn = useServerFn(draftReport);

  const analyses = useMemo(() => {
    // STEP 1 의 questions 배열을 그대로 사용 (canonical order)
    const sorted = session.questions;
    return sorted.map((q) => {
      const answers = session.responses.map((r) => r.answers[q.no]).filter(Boolean);
      if (q.type === "mc") {
        const counts = q.choices.map((label, i) => ({
          name: label,
          value: answers.filter((a: any) => a?.choiceIndex === i).length,
        }));
        // 선택지 패턴에 따라 표현만 분기, 그 외는 공통 형식.
        let sentence = "";
        if (isGenderChoices(q.choices)) sentence = genderSentence(counts, answers.length);
        else if (isAgeChoices(q.choices)) sentence = ageSentence(counts, answers.length);
        else sentence = genericMcSentence(q.text, counts, answers.length);
        return { q, kind: "mc" as const, counts, total: answers.length, sentence };
      }
      if (q.type === "scale") {
        const rowAverages = q.rows.map((row) => {
          const vals = answers
            .map((a: any) => a?.scores?.[row])
            .filter((v: any) => typeof v === "number");
          const avg = vals.length ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0;
          return { name: row, score: Number(avg.toFixed(2)) };
        });
        return {
          q, kind: "scale" as const, rowAverages, total: answers.length,
          sentence: scaleSentence(rowAverages),
        };
      }
      const texts = answers
        .map((a: any) => (a?.text ?? "").trim())
        .filter((t: string) => t.length > 0);
      const sentence = genericSubjSentence(q.text, texts);
      return {
        q, kind: "subj" as const, texts, total: texts.length,
        items: subjectiveList(texts), sentence,
      };
    });
  }, [session]);

  // 분석 화면 진입 즉시 누적 이력에 저장 (중복 방지: programName + analyzedAt)
  const summary = useMemo(() => {
    const scaleScores: number[] = [];
    const highlights: string[] = [];
    let topHighlight: string | undefined;
    let topAvg = -Infinity;
    for (const a of analyses) {
      if (a.kind === "scale") {
        for (const r of a.rowAverages) {
          if (r.score > 0) {
            scaleScores.push(r.score);
            highlights.push(`${r.name} ${r.score.toFixed(2)}`);
            if (r.score > topAvg) { topAvg = r.score; topHighlight = r.name; }
          }
        }
      }
    }
    const avg = scaleScores.length ? scaleScores.reduce((s, v) => s + v, 0) / scaleScores.length : 0;
    return { avgScore: Number(avg.toFixed(2)), highlights, topHighlight };
  }, [analyses]);

  // 분석 화면 최초 진입 시 1회만 누적 이력에 저장
  // 동일 (programName + dept + analyzedAt) 항목은 add 내부에서 자동 replace 처리됨
  const savedToHistoryRef = useRef(false);
  useEffect(() => {
    if (savedToHistoryRef.current) return;
    if (!session.responses.length || !session.questions.length) return;
    const dept = session.department;
    if (!dept) return;
    savedToHistoryRef.current = true;
    // 보고서 빈도표 재구성을 위해 분석 결과를 함께 저장한다.
    const stored: StoredAnalysis[] = [];
    for (const q of session.questions) {
      const answers = session.responses.map((r) => r.answers[q.no]).filter(Boolean);
      if (q.type === "mc") {
        const counts = q.choices.map(
          (_label, i) =>
            answers.filter((a: any) => a?.choiceIndex === i).length,
        );
        stored.push({
          no: q.no, text: q.text, type: "mc",
          choices: q.choices, counts, total: answers.length,
        });
      } else if (q.type === "scale") {
        const rowDist = q.rows.map((row) => {
          const dist = [0, 0, 0, 0, 0];
          let sum = 0;
          let n = 0;
          for (const a of answers as any[]) {
            const v = a?.scores?.[row];
            if (typeof v === "number" && v >= 1 && v <= 5) {
              dist[v - 1] += 1;
              sum += v;
              n += 1;
            }
          }
          return { row, dist, avg: n ? Number((sum / n).toFixed(2)) : 0, n };
        });
        stored.push({
          no: q.no, text: q.text, type: "scale",
          rows: q.rows, rowDist, total: answers.length,
        });
      } else {
        const texts = (answers as any[])
          .map((a) => (a?.text ?? "").trim())
          .filter((t: string) => t.length > 0);
        stored.push({ no: q.no, text: q.text, type: "subj", texts });
      }
    }
    analysisHistory.add(dept, {
      programName: session.surveyName,
      dept: session.department,
      responseCount: session.responses.length,
      avgSatisfaction: summary.avgScore,
      reportData: {
        surveyName: session.surveyName,
        department: session.department,
        avgScore: summary.avgScore,
        highlights: summary.highlights,
        topHighlight: summary.topHighlight,
        questions: session.questions,
        analyses: stored,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.responses.length, session.questions.length]);

  // ───── AI 총평 자동 초안 — questions 순서·라벨 기반으로 동적 생성 ─────
  const generateOverallSummary = (): string => {
    if (!analyses.length || !session.responses.length) return "";
    const total = session.responses.length;
    const parts: string[] = [];
    parts.push(`본 ${session.surveyName} 만족도조사에는 총 ${total}명이 참여하였음.`);

    for (const a of analyses as any[]) {
      if (a.kind === "mc") {
        const top = [...a.counts]
          .filter((c: any) => c.value > 0)
          .sort((x: any, y: any) => y.value - x.value)[0];
        if (!top) continue;
        const pct = ((top.value / a.total) * 100).toFixed(1);
        parts.push(`'${a.q.text}' 문항에서는 '${top.name}'이(가) ${top.value}명(${pct}%)으로 가장 높게 나타남.`);
      } else if (a.kind === "scale") {
        const valid = a.rowAverages.filter((r: any) => r.score > 0);
        if (!valid.length) continue;
        const avg = valid.reduce((s: number, v: any) => s + v.score, 0) / valid.length;
        const sortedR = [...valid].sort((x: any, y: any) => y.score - x.score);
        const high = sortedR[0];
        const low = sortedR[sortedR.length - 1];
        const tone = avg >= 4 ? "높은" : avg >= 3 ? "보통" : "낮은";
        parts.push(
          `'${a.q.text}' 5점 척도 평균 ${avg.toFixed(1)}점으로 전반적으로 ${tone} 만족도를 보였으며, '${high.name}' ${high.score.toFixed(1)}점으로 가장 높게, '${low.name}' ${low.score.toFixed(1)}점으로 가장 낮게 평가됨.`,
        );
      } else if (a.kind === "subj") {
        if (!a.texts.length) continue;
        const wordMap = new Map<string, number>();
        for (const t of a.texts as string[]) {
          for (const w of t.split(/[\s,.!?·…\-/()]+/).filter((w) => w.length >= 2)) {
            wordMap.set(w, (wordMap.get(w) ?? 0) + 1);
          }
        }
        const kws = [...wordMap.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map((e) => `'${e[0]}'`).join(", ");
        const tail = kws ? `, 주요 키워드는 ${kws} 등` : "";
        parts.push(`'${a.q.text}' 주관식 응답 ${a.texts.length}건이 수집됨${tail}.`);
      }
    }

    parts.push("참여자들의 응답을 향후 운영 시 참고 자료로 활용 가능함.");
    return parts.join(" ");
  };

  // 진입 시 / 재생성 시 초안 채우기
  useEffect(() => {
    if (summaryEdited) return;
    const draft = generateOverallSummary();
    if (draft) setSummaryText(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyses.length, session.responses.length]);

  // AI 기반 총평 재생성
  const regenerateSummaryAI = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const samples: string[] = [];
      for (const a of analyses) {
        if (a.kind === "subj") {
          for (const t of a.texts) {
            if (samples.length < 8 && t) samples.push(t);
          }
        }
      }
      const r = await draftReportFn({
        data: {
          surveyName: session.surveyName || "만족도 조사",
          department: session.department || "",
          totalResponses: session.responses.length,
          avgScore: summary.avgScore,
          highlights: summary.highlights,
          freeTextSamples: samples,
        },
      });
      setSummaryEdited(false);
      // 보고서 마크다운에서 평문만 추출
      const plain = (r.markdown || "")
        .replace(/^#+\s.*$/gm, "")
        .replace(/\*\*/g, "")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      setSummaryText(plain || generateOverallSummary());
    } catch (e) {
      console.error("AI 총평 생성 실패:", e);
      setSummaryEdited(false);
      setSummaryText(generateOverallSummary());
    } finally {
      setRegenerating(false);
    }
  };

  // ───── 차트 PNG 저장 (오른쪽 범례 포함) ─────
  const buildChartCanvas = async (a: any): Promise<HTMLCanvasElement> => {
    const el = chartRefs.current[a.q.no];
    if (!el) throw new Error("차트를 찾을 수 없습니다.");
    const svg = el.querySelector("svg") as SVGSVGElement | null;
    if (!svg) throw new Error("SVG를 찾을 수 없습니다.");
    const rect = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || svg.clientWidth || 600));
    const h = Math.max(1, Math.round(rect.height || svg.clientHeight || 360));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(w));
    clone.setAttribute("height", String(h));
    if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("이미지 로드 실패"));
      img.src = url;
    });

    const isMc = a.kind === "mc";
    const pad = 4;
    const titleH = 0; // 문항 질문 표시 제거
    const legendGap = 8;
    const legendItemH = 26;

    // 범례 너비 — 항목 텍스트 전체 길이에 맞춰 자동 확장 (말줄임 없음)
    const tmpCanvas = document.createElement("canvas");
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.font = `bold 14px "맑은 고딕","Malgun Gothic",sans-serif`;
    const legendTextW = isMc
      ? Math.ceil(Math.max(0, ...a.counts.map((c: any) => tmpCtx.measureText(c.name).width)))
      : 0;
    const legendW = isMc ? legendTextW + 28 + 8 : 0; // swatch(16)+gap(8)+padding(4) + right buffer
    const legendH = isMc ? a.counts.length * legendItemH + 8 : 0;
    const contentH = Math.max(h, legendH);
    const logicalW = pad * 2 + w + (isMc ? legendGap + legendW : 0);
    const logicalH = pad * 2 + titleH + contentH;
    const scale = 2;

    const canvas = document.createElement("canvas");
    canvas.width = logicalW * scale;
    canvas.height = logicalH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 컨텍스트를 얻을 수 없습니다.");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, logicalW, logicalH);

    ctx.textBaseline = "top";

    // 차트
    ctx.drawImage(img, pad, pad + titleH, w, h);
    URL.revokeObjectURL(url);

    // 범례 (항목명만, 전체 텍스트 표시 — 말줄임 없음)
    if (isMc) {
      const palette = pickColors(a.counts.length);
      const x0 = pad + w + legendGap;
      const totalH = a.counts.length * legendItemH;
      const y0 = pad + titleH + Math.max(0, (contentH - totalH) / 2);
      a.counts.forEach((c: any, i: number) => {
        const y = y0 + i * legendItemH;
        ctx.fillStyle = palette[i % palette.length];
        ctx.fillRect(x0, y + 4, 16, 16);
        ctx.fillStyle = "#111827";
        ctx.font = `bold 14px "맑은 고딕","Malgun Gothic",sans-serif`;
        ctx.fillText(c.name, x0 + 24, y + 6);
      });
    }

    return canvas;
  };

  const downloadChart = async (a: any) => {
    try {
      const canvas = await buildChartCanvas(a);
      const link = document.createElement("a");
      link.download = `Q${a.q.no}_${sanitizeFileName(a.q.text)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error("차트 저장 실패:", e);
      alert("차트 저장에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const captureChartDataUrl = async (a: any): Promise<string | null> => {
    try {
      const canvas = await buildChartCanvas(a);
      return canvas.toDataURL("image/png");
    } catch (e) {
      console.error("차트 캡쳐 실패:", e);
      return null;
    }
  };

  // 다운로드용 문항 순서 — session.questions(=ALL_QUESTION_KEYS) 순서 그대로 사용
  const sortedAnalyses = analyses;

  // 다운로드용 구분 라벨 — questions 의 q.text 를 그대로 사용 (하드코딩된 키워드 매칭 없음).
  const getKindLabel = (a: any): string => {
    const text = (a.q.text || "").trim();
    return text.length > 24 ? text.slice(0, 24) + "…" : text || "문항";
  };

  // ───── 다운로드 행 생성 (정렬 적용) ─────
  const buildRows = (list: any[] = sortedAnalyses) =>
    list.map((a, idx) => {
      const kind = getKindLabel(a);
      let content = "";
      if (a.kind === "subj") {
        content = a.texts.length ? a.items.join(" / ") : "응답 없음";
        if (a.sentence) content = `${a.sentence}${a.texts.length ? `\n응답: ${a.items.join(" / ")}` : ""}`;
      } else {
        content = a.sentence;
      }
      return { no: idx + 1, kind, content, ref: a };
    });

  const downloadDocx = async () => {
    const rows = buildRows();
    const docx: any = await import("docx");
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      ImageRun,
      HeadingLevel,
      AlignmentType,
      WidthType,
      BorderStyle,
      ShadingType,
    } = docx;

    // 차트 이미지 캡쳐 (subj 제외)
    const chartImages: Record<number, Uint8Array | null> = {};
    for (const r of rows) {
      if (r.ref.kind !== "subj") {
        const dataUrl = await captureChartDataUrl(r.ref);
        if (dataUrl) {
          const base64 = dataUrl.split(",")[1] ?? "";
          const bin = atob(base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          chartImages[r.ref.q.no] = bytes;
        } else {
          chartImages[r.ref.q.no] = null;
        }
      }
    }

    const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

    const textCell = (text: string, width: number, opts: { bold?: boolean; align?: any; shade?: string } = {}) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders,
        margins: cellMargins,
        shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR, color: "auto" } : undefined,
        children: (text || " ").split("\n").map(
          (line) =>
            new Paragraph({
              alignment: opts.align,
              children: [new TextRun({ text: line || " ", bold: opts.bold, font: "맑은 고딕", size: 20 })],
            }),
        ),
      });

    const imageCell = (bytes: Uint8Array | null | undefined, width: number) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        borders,
        margins: cellMargins,
        children: [
          bytes
            ? new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: "png",
                    data: bytes,
                    transformation: { width: 240, height: 150 },
                  }),
                ],
              })
            : new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "-", font: "맑은 고딕", size: 20 })],
              }),
        ],
      });

    // 4-column widths (DXA), total = 9360 (content width for US Letter, 1" margins)
    const W = [700, 1700, 3200, 3760];

    const headerRow = new TableRow({
      tableHeader: true,
      children: ["연번", "구분", "그래프", "분석 내용"].map((t, i) =>
        textCell(t, W[i], { bold: true, align: AlignmentType.CENTER, shade: "E8EEF7" }),
      ),
    });

    const bodyRows = rows.map(
      (r) =>
        new TableRow({
          children: [
            textCell(String(r.no), W[0], { align: AlignmentType.CENTER }),
            textCell(r.kind, W[1], { align: AlignmentType.CENTER }),
            imageCell(chartImages[r.ref.q.no], W[2]),
            textCell(r.content, W[3]),
          ],
        }),
    );

    const table = new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: W,
      rows: [headerRow, ...bodyRows],
    });

    const titleText = `${session.surveyName} 만족도 조사 결과`;
    const subtitleText = `정원 ${session.responses.length}명 전원이 만족도조사 참여(100.0%)함.`;

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "맑은 고딕", size: 22 } } },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: titleText, bold: true, font: "맑은 고딕", size: 36 })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: subtitleText, font: "맑은 고딕", size: 22 })],
            }),
            new Paragraph({ children: [new TextRun({ text: " " })] }),
            table,
            new Paragraph({ children: [new TextRun({ text: " " })] }),
            new Paragraph({
              children: [new TextRun({ text: "나. 총괄평가", bold: true, font: "맑은 고딕", size: 26 })],
            }),
            ...(summaryText || " ")
              .split("\n")
              .map(
                (line) =>
                  new Paragraph({
                    children: [new TextRun({ text: `- ${line}`, font: "맑은 고딕", size: 22 })],
                  }),
              ),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(session.surveyName)}_만족도분석결과.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadXlsx = async () => {
    const rows = buildRows();
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

    // 차트 이미지 캡쳐 (subj 제외)
    const chartImages: Record<number, string | null> = {};
    for (const r of rows) {
      if (r.ref.kind !== "subj") {
        chartImages[r.ref.q.no] = await captureChartDataUrl(r.ref);
      }
    }

    const ExcelJS: any = (await import("exceljs")).default ?? (await import("exceljs"));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("분석결과");
    ws.columns = [
      { width: 6 },   // 연번
      { width: 16 },  // 구분
      { width: 55 },  // 그래프 (이미지 폭에 맞게 확장)
      { width: 50 },  // 분석 내용
    ];

    ws.addRow([`${session.surveyName} 만족도 응답 분석 결과`]);
    ws.addRow([]);
    ws.addRow(["기관명", "강남시니어플라자"]);
    ws.addRow(["부서명", session.department]);
    ws.addRow(["응답자 수", `${session.responses.length}명`]);
    ws.addRow(["분석일", dateStr]);
    ws.addRow([]);
    const headerRow = ws.addRow(["연번", "구분", "그래프", "분석 내용"]);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 30;

    for (const r of rows) {
      const row = ws.addRow([r.no, r.kind, "", r.content]);
      row.alignment = { vertical: "top", wrapText: true };
      const rowIdx = row.number; // 1-based
      const dataUrl = r.ref.kind !== "subj" ? chartImages[r.ref.q.no] : null;
      if (dataUrl) {
        const base64 = dataUrl.split(",")[1] ?? "";
        const imgId = wb.addImage({ base64, extension: "png" });
        // 셀 행 높이 (포인트). 차트 삽입 행: 200pt
        row.height = 200;
        // tl: 0-based (col, row). 3번째 컬럼(그래프) = col 2
        ws.addImage(imgId, {
          tl: { col: 2, row: rowIdx - 1 } as any,
          ext: { width: 380, height: 240 } as any,
          editAs: "oneCell",
        });
      } else {
        // 주관식 등 차트 없는 행: 60pt
        row.height = 60;
      }
    }

    ws.addRow([]);
    const totalLabel = ws.addRow(["총평"]);
    totalLabel.font = { bold: true };
    const totalRow = ws.addRow([summaryText]);
    totalRow.alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
    totalRow.height = 120;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(session.surveyName)}_분석결과.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadPdf = async () => {
    const rows = buildRows();
    // 차트 이미지 캡쳐 (subj 제외)
    const chartImages: Record<number, string | null> = {};
    for (const r of rows) {
      if (r.ref.kind !== "subj") {
        chartImages[r.ref.q.no] = await captureChartDataUrl(r.ref);
      }
    }
    const total = session.responses.length;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"/>
<title>${esc(session.surveyName)} 만족도 조사 결과</title>
<style>
  body{font-family:"맑은 고딕","Malgun Gothic",sans-serif;padding:32px;color:#111}
  h2.section{font-size:18px;margin:0 0 8px}
  .intro{font-size:14px;margin:0 0 14px;line-height:1.7}
  table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
  th,td{border:1px solid #444;padding:4px;vertical-align:middle;text-align:left;word-wrap:break-word}
  th{background:#eef2f8;text-align:center}
  td.no{width:4%;text-align:center}
  td.kind{width:10%;white-space:nowrap;text-align:center;font-weight:600}
  td.graph{width:42%;text-align:center;padding:4px}
  td.graph img{width:100%;max-width:100%;height:auto;display:block}
  .summary{border:1px solid #444;padding:14px;font-size:14px;line-height:1.8;white-space:pre-wrap;margin-top:6px}
  h2.eval{font-size:18px;margin:28px 0 8px}
  .hint{margin-top:18px;font-size:12px;color:#666}
  @media print{.hint{display:none}}
</style></head><body>
<h2 class="section">가. ${esc(session.surveyName)} 만족도 조사 결과</h2>
<p class="intro">- 정원 ${total}명 전원이 만족도조사 참여(100.0%)함.</p>
<table>
  <thead><tr><th style="width:4%">연번</th><th style="width:10%">구분</th><th style="width:42%">그래프</th><th>분석 내용</th></tr></thead>
  <tbody>
    ${rows.map((r) => {
      const img = r.ref.kind !== "subj" && chartImages[r.ref.q.no]
        ? `<img src="${chartImages[r.ref.q.no]}" alt="chart"/>`
        : "";
      return `<tr><td class="no">${r.no}</td><td class="kind">${esc(r.kind)}</td><td class="graph">${img}</td><td>${esc(r.content)}</td></tr>`;
    }).join("")}
  </tbody>
</table>
<h2 class="eval">나. 총괄평가</h2>
<div class="summary">- ${esc(summaryText)}</div>
<p class="hint">※ 인쇄 창에서 "PDF로 저장"을 선택하세요. (Ctrl/⌘ + P)</p>
<script>window.onload=()=>setTimeout(()=>window.print(),500);</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  if (!session.responses.length) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <div className="text-sm font-medium">분석할 응답이 아직 없어요</div>
          <Link
            to="/upload"
            className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            업로드하러 가기
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Step 3"
        title="응답 항목 분석"
        description={`업로드한 ${session.responses.length}건의 응답을 문항별로 자동 집계했습니다.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-col items-start">
              <button onClick={downloadDocx} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary">
                <FileText className="h-4 w-4" /> 문서 파일 (DOCX)
              </button>
              <span className="mt-1 text-xs text-slate-400">한글·워드 모두 열 수 있습니다</span>
            </div>
            <button onClick={downloadXlsx} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary">
              <FileSpreadsheet className="h-4 w-4" /> 엑셀
            </button>
            <button onClick={downloadPdf} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary">
              <FileDown className="h-4 w-4" /> PDF
            </button>
            <button
              onClick={() => {
                if (!session.responses.length) return;
                if (!confirm("업로드된 모든 응답 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
                surveySession.clearResponses();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
            >
              <RotateCcw className="h-4 w-4" /> 초기화
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6">
        {analyses.map((a, idx) => (
          <div key={a.q.no} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  Q{idx + 1} · {a.q.type === "mc" ? "객관식" : a.q.type === "scale" ? "5점 척도" : "주관식"}
                </div>
                <h3 className="mt-1 text-base font-semibold">{a.q.text}</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                  응답 {a.total}건
                </span>
                {a.kind !== "subj" && (
                  <button
                    onClick={() => downloadChart(a)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                    title="차트 PNG 저장"
                  >
                    <Download className="h-3.5 w-3.5" /> 차트 저장
                  </button>
                )}
              </div>
            </div>

            {a.kind === "mc" && (
              <div
                ref={(el) => { chartRefs.current[a.q.no] = el; }}
                className="mt-5 flex flex-row items-center justify-center gap-2 bg-card p-2"
              >
                <div className="h-64 w-full max-w-[420px] shrink">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={a.counts}
                        dataKey="value"
                        nameKey="name"
                        outerRadius={90}
                        label={renderPieLabel}
                        labelLine={false}
                        isAnimationActive={false}
                      >
                        {a.counts.map((_, i) => (
                          <Cell key={i} fill={pickColors(a.counts.length)[i % pickColors(a.counts.length).length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {a.counts.map((c, i) => {
                    const palette = pickColors(a.counts.length);
                    return (
                      <li key={c.name} className="flex items-start gap-2 text-base">
                        <span
                          className="mt-1.5 inline-block h-3 w-3 shrink-0 rounded-sm"
                          style={{ background: palette[i % palette.length] }}
                        />
                        <span className="block whitespace-normal break-words">
                          {c.name}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {a.kind === "scale" && (
              <div
                ref={(el) => { chartRefs.current[a.q.no] = el; }}
                className="mt-5 h-80 bg-card p-2"
              >
                <ResponsiveContainer>
                  <BarChart data={a.rowAverages} margin={{ top: 28, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: 600 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 14 }} />
                    <Tooltip />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]} fill="#4f6bef" isAnimationActive={false}>
                      <LabelList
                        dataKey="score"
                        position="top"
                        formatter={(v: number) => Number(v).toFixed(1)}
                        style={{ fontSize: 16, fill: "#1f2937", fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {a.kind === "subj" && (
              <div className="mt-5 space-y-2">
                {a.texts.length === 0 ? (
                  <div className="rounded-lg bg-secondary p-4 text-center text-xs text-muted-foreground">
                    수집된 주관식 응답이 없습니다
                  </div>
                ) : (
                  a.items.slice(0, 8).map((t, i) => (
                    <div key={i} className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                      “{t}”
                    </div>
                  ))
                )}
                {a.items.length > 8 && (
                  <div className="text-xs text-muted-foreground">외 {a.items.length - 8}건</div>
                )}
              </div>
            )}

            {a.sentence && (
              <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
                <div className="mb-1 text-xs font-semibold text-primary">분석 내용</div>
                {a.sentence}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 총평 */}
      <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">총평</h3>
          </div>
          <button
            onClick={regenerateSummaryAI}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {regenerating ? "생성 중..." : "총평 다시 생성"}
          </button>
        </div>
        <div className="my-3 h-px bg-border" />
        <textarea
          value={summaryText}
          onChange={(e) => { setSummaryText(e.target.value); setSummaryEdited(true); }}
          rows={8}
          placeholder="AI가 자동으로 초안을 생성합니다. 필요한 경우 직접 수정하세요."
          className="w-full resize-y rounded-lg border border-border bg-background p-4 text-sm leading-relaxed outline-none focus:border-primary"
        />
      </div>

      <div className="mt-10 flex flex-col items-end gap-2">
        <p className="text-xs text-muted-foreground">
          분석이 완료되었습니다. 보고서 초안을 생성할 수 있습니다.
        </p>
        <Link
          to="/report"
          aria-disabled={!analyses.length}
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold shadow-[var(--shadow-soft)] ${
            analyses.length
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "pointer-events-none bg-muted text-muted-foreground opacity-50"
          }`}
        >
          AI 보고서 초안 생성하기 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </AppShell>
  );
}