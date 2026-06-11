import { type ReactNode, useEffect, useRef } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  type AnalysisHistoryItem, type StoredAnalysis,
  type MergedProgram, mergePrograms,
} from "@/lib/analysis-history";

/* ──────────────────────────────────────────────────────────
   섹션 분류 — questions 라벨만 보고 분류
   ────────────────────────────────────────────────────────── */

const looksLikePath = (t: string) => /(경로|알게|알고\s*참여|어떻게\s*알)/.test(t);
const looksLikeStrength = (t: string) => /(강점|장점)/.test(t);
const looksLikeTopic = (t: string) =>
  /(주제|희망|참여하고\s*싶|배우고\s*싶)/.test(t);
const looksLikeSuggestion = (t: string) =>
  /(소감|건의|개선|의견|바라는|바람)/.test(t);

const isGenderChoices = (choices: string[]) =>
  choices.length === 2 && choices.every((c) => /^(남|여)(자|성)?$/.test(c.trim()));
const isAgeChoices = (choices: string[]) =>
  choices.length > 0 && choices.every((c) => /\d+\s*대/.test(c));

type Section = "gender" | "age" | "basicEtc" | "path" | "satisfaction" | "strength" | "topic" | "suggestion" | "etcMc" | "etcSubj";

function classify(a: StoredAnalysis): Section {
  if (a.type === "scale") return "satisfaction";
  if (a.type === "mc") {
    if (isGenderChoices(a.choices)) return "gender";
    if (isAgeChoices(a.choices)) return "age";
    if (looksLikePath(a.text)) return "path";
    if (looksLikeStrength(a.text)) return "strength";
    return "basicEtc"; // 기타 객관식 → 기본현황 그룹으로
  }
  if (looksLikeTopic(a.text)) return "topic";
  if (looksLikeSuggestion(a.text)) return "suggestion";
  return "etcSubj";
}

/* ──────────────────────────────────────────────────────────
   보고서 모델
   ────────────────────────────────────────────────────────── */

export type ReportInput = {
  surveyName: string;
  department: string;
  period: string;
  reportYear: string;
  selected: AnalysisHistoryItem[];
};

export type ProgramSection = {
  id: string;
  programName: string;
  mergeNote: string;
  responseCount: number;
  avgScore: number;
  gender?: Extract<StoredAnalysis, { type: "mc" }>;
  age?: Extract<StoredAnalysis, { type: "mc" }>;
  basicEtc: Extract<StoredAnalysis, { type: "mc" }>[];
  path?: Extract<StoredAnalysis, { type: "mc" }>;
  satisfaction?: Extract<StoredAnalysis, { type: "scale" }>;
  strength?: Extract<StoredAnalysis, { type: "mc" }>;
  topic?: Extract<StoredAnalysis, { type: "subj" }>;
  suggestion?: Extract<StoredAnalysis, { type: "subj" }>;
  etcMc: Extract<StoredAnalysis, { type: "mc" }>[];
  etcSubj: Extract<StoredAnalysis, { type: "subj" }>[];
  hasData: boolean;
};

export type ReportModel = {
  input: ReportInput;
  totalRespondents: number;
  programs: ProgramSection[];
  mcLabelsForIntro: string[];
  overallAvg: number;
};

function programFromMerged(m: MergedProgram): ProgramSection {
  const basicEtc: ProgramSection["basicEtc"] = [];
  const etcMc: ProgramSection["etcMc"] = [];
  const etcSubj: ProgramSection["etcSubj"] = [];
  let gender: ProgramSection["gender"];
  let age: ProgramSection["age"];
  let path: ProgramSection["path"];
  let satisfaction: ProgramSection["satisfaction"];
  let strength: ProgramSection["strength"];
  let topic: ProgramSection["topic"];
  let suggestion: ProgramSection["suggestion"];
  for (const a of m.analyses) {
    const s = classify(a);
    if (s === "gender" && a.type === "mc") { if (!gender) gender = a; else basicEtc.push(a); }
    else if (s === "age" && a.type === "mc") { if (!age) age = a; else basicEtc.push(a); }
    else if (s === "basicEtc" && a.type === "mc") basicEtc.push(a);
    else if (s === "path" && a.type === "mc") { if (!path) path = a; else etcMc.push(a); }
    else if (s === "satisfaction" && a.type === "scale") { if (!satisfaction) satisfaction = a; }
    else if (s === "strength" && a.type === "mc") { if (!strength) strength = a; else etcMc.push(a); }
    else if (s === "topic" && a.type === "subj") { if (!topic) topic = a; else etcSubj.push(a); }
    else if (s === "suggestion" && a.type === "subj") { if (!suggestion) suggestion = a; else etcSubj.push(a); }
    else if (a.type === "subj") etcSubj.push(a);
    else if (a.type === "mc") etcMc.push(a);
  }
  return {
    id: m.id, programName: m.programName, mergeNote: m.mergeNote,
    responseCount: m.responseCount, avgScore: m.avgSatisfaction,
    gender, age, basicEtc, path, satisfaction, strength, topic, suggestion,
    etcMc, etcSubj, hasData: m.hasData,
  };
}

export function buildReportModel(input: ReportInput): ReportModel {
  const merged = mergePrograms(input.selected);
  const programs = merged.map(programFromMerged);

  const totalRespondents = programs.reduce((s, p) => s + p.responseCount, 0);
  const allMcLabels = new Set<string>();
  for (const p of programs) {
    if (p.path) allMcLabels.add(p.path.text);
    if (p.strength) allMcLabels.add(p.strength.text);
    for (const a of p.basicEtc) allMcLabels.add(a.text);
    for (const a of p.etcMc) allMcLabels.add(a.text);
  }
  const validAvgs = programs.map((p) => p.avgScore).filter((v) => v > 0);
  const overallAvg = validAvgs.length
    ? Number((validAvgs.reduce((s, v) => s + v, 0) / validAvgs.length).toFixed(2))
    : 0;

  return { input, totalRespondents, programs, mcLabelsForIntro: [...allMcLabels], overallAvg };
}

/* ──────────────────────────────────────────────────────────
   문장 생성 헬퍼
   ────────────────────────────────────────────────────────── */

const pct = (n: number, total: number) =>
  total ? ((n / total) * 100).toFixed(1) : "0.0";

function basicPara(p: ProgramSection): string {
  const parts: string[] = [];
  for (const a of [p.gender, p.age, ...p.basicEtc].filter(Boolean) as Extract<StoredAnalysis, { type: "mc" }>[]) {
    const ranked = a.choices
      .map((c, i) => ({ name: c, value: a.counts[i] ?? 0 }))
      .filter((c) => c.value > 0)
      .sort((x, y) => y.value - x.value);
    if (!ranked.length) continue;
    const phrases = ranked.map((c) => `${c.name} ${c.value}명(${pct(c.value, a.total)}%)`);
    parts.push(`${a.text}: ${phrases.join(", ")}`);
  }
  if (!parts.length) return `총 ${p.responseCount}명이 설문에 응답하였음.`;
  return `응답자 ${p.responseCount}명의 기본현황은 ${parts.join("; ")} 으로 나타남.`;
}

function channelPara(a: Extract<StoredAnalysis, { type: "mc" }>): string {
  const ranked = a.choices
    .map((c, i) => ({ name: c, value: a.counts[i] ?? 0 }))
    .filter((c) => c.value > 0)
    .sort((x, y) => y.value - x.value);
  if (!ranked.length) return "참여경로 응답이 없습니다.";
  const phrases = ranked.map((c) => `'${c.name}' ${c.value}명(${pct(c.value, a.total)}%)`);
  return `프로그램 참여경로는 ${phrases.join(", ")} 순으로 나타남.`;
}

function satPara(a: Extract<StoredAnalysis, { type: "scale" }>): string {
  const valid = a.rowDist.filter((r) => r.n > 0);
  if (!valid.length) return "세부 만족도 응답이 없습니다.";
  const sorted = [...valid].sort((x, y) => y.avg - x.avg);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const avg = valid.reduce((s, r) => s + r.avg, 0) / valid.length;
  const tone = avg >= 4 ? "전반적으로 높은" : avg >= 3 ? "보통 수준의" : "다소 낮은";
  return `세부 만족도 평균은 ${avg.toFixed(2)}점으로 ${tone} 만족도를 보였으며, '${top.row}' ${top.avg.toFixed(2)}점으로 가장 높고 '${bottom.row}' ${bottom.avg.toFixed(2)}점으로 가장 낮게 평가됨.`;
}

function strengthPara(a: Extract<StoredAnalysis, { type: "mc" }>): string {
  const ranked = a.choices
    .map((c, i) => ({ name: c, value: a.counts[i] ?? 0 }))
    .filter((c) => c.value > 0)
    .sort((x, y) => y.value - x.value);
  if (!ranked.length) return "강점 응답이 없습니다.";
  const top = ranked[0];
  return `프로그램의 가장 큰 강점으로는 '${top.name}'이(가) ${top.value}명(${pct(top.value, a.total)}%)으로 가장 많이 선택되었음.`;
}

function dedupTexts(texts: string[]): { text: string; count: number }[] {
  const map = new Map<string, number>();
  for (const t of texts) {
    const k = t.trim();
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
    .map(([text, count]) => ({ text, count }));
}

/* Ⅴ. 결론 및 제언 — AI 자동 생성 */

export function generateAnalysisResult(model: ReportModel): string {
  const { programs, totalRespondents, overallAvg, input } = model;
  if (!programs.length) return "";
  const lines: string[] = [];
  lines.push(
    `${input.reportYear}년 ${input.surveyName} 만족도조사에는 ${programs.length}개 세부 프로그램, 총 ${totalRespondents}명이 참여하였음.`,
  );
  // 성별·연령 종합
  const gAll = { 남: 0, 여: 0 }; let gTot = 0;
  const ageMap = new Map<string, number>(); let aTot = 0;
  for (const p of programs) {
    if (p.gender) {
      for (let i = 0; i < p.gender.choices.length; i++) {
        const c = p.gender.choices[i];
        const v = p.gender.counts[i] ?? 0;
        if (/여/.test(c)) gAll.여 += v;
        else if (/남/.test(c)) gAll.남 += v;
        gTot += v;
      }
    }
    if (p.age) {
      for (let i = 0; i < p.age.choices.length; i++) {
        const c = p.age.choices[i];
        const v = p.age.counts[i] ?? 0;
        ageMap.set(c, (ageMap.get(c) ?? 0) + v);
        aTot += v;
      }
    }
  }
  if (gTot > 0) {
    lines.push(`전체 응답자의 성별 비율은 여 ${gAll.여}명(${pct(gAll.여, gTot)}%), 남 ${gAll.남}명(${pct(gAll.남, gTot)}%)으로 나타남.`);
  }
  if (ageMap.size > 0) {
    const sorted = [...ageMap.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`연령대 분포는 ${sorted.map(([k, v]) => `${k} ${pct(v, aTot)}%`).join(", ")} 순으로 나타남.`);
  }
  if (overallAvg > 0) {
    const tone = overallAvg >= 4 ? "높은" : overallAvg >= 3 ? "보통" : "낮은";
    lines.push(`전체 평균 만족도는 ${overallAvg.toFixed(2)}점으로 ${tone} 수준임.`);
  }
  const ranked = programs.filter((p) => p.avgScore > 0).sort((a, b) => b.avgScore - a.avgScore);
  if (ranked.length >= 2) {
    const top = ranked[0]; const low = ranked[ranked.length - 1];
    lines.push(`세부 프로그램 중 '${top.programName}'이(가) 평균 ${top.avgScore.toFixed(2)}점으로 가장 높았고, '${low.programName}'이(가) ${low.avgScore.toFixed(2)}점으로 가장 낮게 평가됨.`);
  }
  // 강점 종합
  const strengthMap = new Map<string, number>();
  for (const p of programs) {
    if (!p.strength) continue;
    for (let i = 0; i < p.strength.choices.length; i++) {
      strengthMap.set(p.strength.choices[i],
        (strengthMap.get(p.strength.choices[i]) ?? 0) + (p.strength.counts[i] ?? 0));
    }
  }
  if (strengthMap.size > 0) {
    const top = [...strengthMap.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) lines.push(`전체 프로그램의 강점으로는 '${top[0]}'이(가) ${top[1]}건으로 가장 많이 선택됨.`);
  }
  return lines.join(" ");
}

export function generateSuggestions(model: ReportModel): string {
  const { programs } = model;
  const lines: string[] = [];
  // ① 만족도 낮은 항목 개선
  const lowItems: { name: string; score: number }[] = [];
  for (const p of programs) {
    if (!p.satisfaction) continue;
    for (const r of p.satisfaction.rowDist) {
      if (r.n > 0) lowItems.push({ name: r.row, score: r.avg });
    }
  }
  lowItems.sort((a, b) => a.score - b.score);
  if (lowItems.length) {
    const bottom = lowItems.slice(0, 2).map((r) => `'${r.name}'(${r.score.toFixed(2)}점)`).join(", ");
    lines.push(`① 평균 만족도가 상대적으로 낮은 ${bottom} 항목은 운영 방식 점검과 보완을 통한 개선이 필요함.`);
  } else {
    lines.push("① 세부 만족도 응답이 충분히 수집된 후 낮은 항목 위주로 개선 방안을 도출할 필요가 있음.");
  }
  // ② 참여자 수요 반영
  const topicMap = new Map<string, number>();
  for (const p of programs) {
    if (!p.topic) continue;
    for (const t of p.topic.texts) {
      const k = t.trim();
      if (!k) continue;
      topicMap.set(k, (topicMap.get(k) ?? 0) + 1);
    }
  }
  const topTopics = [...topicMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topTopics.length) {
    lines.push(`② 추후 참여 희망 주제로 ${topTopics.map(([t, n]) => `'${t}'(${n}건)`).join(", ")} 등이 다수 언급되어, 향후 프로그램 기획 시 반영할 필요가 있음.`);
  } else {
    lines.push("② 참여자 의견을 지속적으로 수렴하여 신규 프로그램 기획에 반영할 필요가 있음.");
  }
  // ③ 강점 유지·강화
  const strengthMap = new Map<string, number>();
  for (const p of programs) {
    if (!p.strength) continue;
    for (let i = 0; i < p.strength.choices.length; i++) {
      strengthMap.set(p.strength.choices[i],
        (strengthMap.get(p.strength.choices[i]) ?? 0) + (p.strength.counts[i] ?? 0));
    }
  }
  const topStrength = [...strengthMap.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topStrength && topStrength[1] > 0) {
    lines.push(`③ 가장 많이 선택된 강점인 '${topStrength[0]}' 요소를 지속적으로 유지·강화하여 프로그램 만족도를 더욱 높일 필요가 있음.`);
  } else {
    lines.push("③ 프로그램의 강점 요소를 발굴·강화하여 참여자 만족도를 제고할 필요가 있음.");
  }
  return lines.join("\n");
}

/* ──────────────────────────────────────────────────────────
   편집 가능한 텍스트 블록
   ────────────────────────────────────────────────────────── */

function Editable({
  id, value, onChange, className,
}: {
  id: string; value: string;
  onChange: (id: string, next: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-report-block={id}
      onBlur={(e) => onChange(id, e.currentTarget.innerText)}
      className={
        "outline-none rounded-md px-2 py-1 -mx-2 hover:bg-secondary/40 focus:bg-secondary/60 focus:ring-2 focus:ring-primary/40 whitespace-pre-wrap " +
        (className ?? "")
      }
    />
  );
}

/* ──────────────────────────────────────────────────────────
   차트 컴포넌트 — recharts SVG. 캡처는 [data-chart-id] 로 식별.
   ────────────────────────────────────────────────────────── */

const COLORS = ["#4f6bef", "#5a9fe0", "#7fb3a8", "#e8b54a", "#e85d5d", "#a78bfa", "#94a3b8"];
const TWO_COLORS = ["#4f6bef", "#e85d5d"];

const renderPieLabel = (props: any) => {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (!percent) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700}>
      {(percent * 100).toFixed(1)}%
    </text>
  );
};

function PieBlock({ chartId, data }: { chartId: string; data: { name: string; value: number }[] }) {
  const palette = data.length === 2 ? TWO_COLORS : COLORS;
  return (
    <div data-chart-id={chartId} className="w-full h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="40%" cy="50%" outerRadius={90} label={renderPieLabel} labelLine={false} isAnimationActive={false}>
            {data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarBlock({ chartId, data, domain = [0, 5] }: { chartId: string; data: { name: string; value: number }[]; domain?: [number, number] }) {
  return (
    <div data-chart-id={chartId} className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" fontSize={11} interval={0} angle={-12} textAnchor="end" height={50} />
          <YAxis domain={domain} fontSize={11} />
          <Tooltip />
          <Bar dataKey="value" fill="#4f6bef" isAnimationActive={false}>
            <LabelList dataKey="value" position="top" fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   본문
   ────────────────────────────────────────────────────────── */

const RATING_LABELS = ["매우불만족", "불만족", "보통", "만족", "매우만족"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-foreground border-b border-border pb-1">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ScaleTable({ a }: { a: Extract<StoredAnalysis, { type: "scale" }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/60">
            <th className="border border-border px-2 py-1 text-left">구분(n={a.total})</th>
            {RATING_LABELS.map((l) => (
              <th key={l} className="border border-border px-2 py-1">{l}</th>
            ))}
            <th className="border border-border px-2 py-1">평균</th>
          </tr>
        </thead>
        <tbody>
          {a.rowDist.map((r) => (
            <tr key={r.row}>
              <td className="border border-border px-2 py-1 font-medium">{r.row}</td>
              {r.dist.map((v, i) => (
                <td key={i} className="border border-border px-2 py-1 text-center">
                  {v}({pct(v, r.n)}%)
                </td>
              ))}
              <td className="border border-border px-2 py-1 text-center font-semibold">
                {r.avg ? r.avg.toFixed(2) : "-"}점
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FreqTable({ a }: { a: Extract<StoredAnalysis, { type: "mc" }> }) {
  const rows = a.choices.map((c, i) => ({ name: c, value: a.counts[i] ?? 0 }));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/60">
            <th className="border border-border px-2 py-1 text-left">구분(n={a.total})</th>
            <th className="border border-border px-2 py-1">N(%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="border border-border px-2 py-1">{r.name}</td>
              <td className="border border-border px-2 py-1 text-center">
                {r.value}({pct(r.value, a.total)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const mcChartData = (a: Extract<StoredAnalysis, { type: "mc" }>) =>
  a.choices.map((c, i) => ({ name: c, value: a.counts[i] ?? 0 })).filter((r) => r.value > 0);

export type ReportEdits = Record<string, string>;

export function ReportDocument({
  model, edits, onEdit,
  resultText, onResultChange,
  suggestionText, onSuggestionChange,
}: {
  model: ReportModel;
  edits: ReportEdits;
  onEdit: (id: string, next: string) => void;
  resultText: string;
  onResultChange: (next: string) => void;
  suggestionText: string;
  onSuggestionChange: (next: string) => void;
}) {
  const { input, programs, totalRespondents, mcLabelsForIntro } = model;

  const val = (id: string, fallback: string) =>
    edits[id] != null ? edits[id] : fallback;

  const targetPara =
    `${input.period} ${input.surveyName} 교육 및 체험 프로그램에 참여한 회원 중 대면 설문조사가 가능하고 중복되지 않는 이용자를 대상으로 설문조사를 진행하였으며 총 ${totalRespondents}명이 설문에 참여하였음.`;
  const methodPara =
    "본 조사는 구조화된 설문지 양식에 따라 구글 플랫폼 비대면 조사를 실시하였고, 대면 프로그램 진행에 따른 세부 프로그램별 자기기입식 조사 실시 후 설문지를 즉시 회수하였음.";
  const periodPara =
    `${input.period} ${input.surveyName} 세부 프로그램 종료 시 설문조사를 진행하여 ${input.reportYear}년 ${input.surveyName} 만족도분석보고서를 작성함.`;
  const mcLabelStr = mcLabelsForIntro.length ? mcLabelsForIntro.join(", ") : "주요 문항";
  const contentPara =
    `본 조사는 세부 프로그램별 응답자의 성별, 연령 등 일반적인 특성, ${mcLabelStr}, 세부 만족도, 프로그램의 강점, 추후 참여하고 싶은 강의 주제, 프로그램 참여 소감 및 건의사항 등의 문항으로 구성하였음.`;
  const methodAnalysisPara =
    "본 조사는 Microsoft Excel 2010을 이용하여 통계 분석하였으며 빈도분석을 진행하였음.";

  return (
    <div data-report-root className="space-y-8 text-sm leading-relaxed">
      <header className="text-center space-y-1 border-b border-border pb-4">
        <Editable id="title.main" value={val("title.main", `${input.reportYear} 사업별 만족도조사 분석 보고서`)} onChange={onEdit} className="text-xl font-bold" />
        <Editable id="title.sub" value={val("title.sub", `<${input.surveyName}>`)} onChange={onEdit} className="text-base text-muted-foreground" />
      </header>

      <Section title="Ⅰ. 조사대상 및 방법">
        <div><p className="font-semibold mb-1">1. 조사대상</p>
          <Editable id="i.target" value={val("i.target", targetPara)} onChange={onEdit} /></div>
        <div><p className="font-semibold mb-1">2. 조사방법</p>
          <Editable id="i.method" value={val("i.method", methodPara)} onChange={onEdit} /></div>
        <div><p className="font-semibold mb-1">3. 조사기간</p>
          <Editable id="i.period" value={val("i.period", periodPara)} onChange={onEdit} /></div>
      </Section>

      <Section title="Ⅱ. 조사내용">
        <Editable id="ii.content" value={val("ii.content", contentPara)} onChange={onEdit} />
      </Section>

      <Section title="Ⅲ. 조사분석방법">
        <Editable id="iii.method" value={val("iii.method", methodAnalysisPara)} onChange={onEdit} />
      </Section>

      <Section title="Ⅳ. 만족도조사 분석">
        <h3 className="font-bold text-sm">1. 세부 프로그램별 분석내용</h3>
        {programs.map((p, idx) => (
          <div key={p.id} className="space-y-3 pl-2 border-l-2 border-primary/30">
            <h4 className="font-bold text-foreground">
              {idx + 1}) {p.programName}
              {(p.mergeNote || p.responseCount > 0) && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({[p.mergeNote, `총 응답자 ${p.responseCount}명`].filter(Boolean).join(" / ")})
                </span>
              )}
            </h4>
            {!p.hasData ? (
              <p className="text-xs text-muted-foreground italic">
                이 분석 이력에는 집계 데이터가 없습니다. (응답자 {p.responseCount}명 / 평균 {p.avgScore.toFixed(2)}점)
              </p>
            ) : (
              <>
                <div>
                  <p className="font-semibold mb-1">(1) 응답자의 기본현황</p>
                  <div className="grid md:grid-cols-2 gap-3 my-2">
                    {p.gender && <PieBlock chartId={`p.${p.id}.gender`} data={mcChartData(p.gender)} />}
                    {p.age && <PieBlock chartId={`p.${p.id}.age`} data={mcChartData(p.age)} />}
                  </div>
                  <Editable id={`p.${p.id}.basic`} value={val(`p.${p.id}.basic`, basicPara(p))} onChange={onEdit} />
                </div>
                {p.path && (
                  <div>
                    <p className="font-semibold mb-1">(2) 프로그램 참여경로</p>
                    <PieBlock chartId={`p.${p.id}.path`} data={mcChartData(p.path)} />
                    <Editable id={`p.${p.id}.path`} value={val(`p.${p.id}.path`, channelPara(p.path))} onChange={onEdit} />
                  </div>
                )}
                {p.satisfaction && (
                  <div>
                    <p className="font-semibold mb-1">(3) 프로그램 세부만족도</p>
                    <ScaleTable a={p.satisfaction} />
                    <div className="my-2">
                      <BarBlock
                        chartId={`p.${p.id}.sat`}
                        data={p.satisfaction.rowDist.map((r) => ({ name: r.row, value: r.avg }))}
                      />
                    </div>
                    <Editable id={`p.${p.id}.sat`} value={val(`p.${p.id}.sat`, satPara(p.satisfaction))} onChange={onEdit} />
                  </div>
                )}
                {p.strength && (
                  <div>
                    <p className="font-semibold mb-1">(4) 프로그램의 강점</p>
                    <FreqTable a={p.strength} />
                    <div className="my-2">
                      <PieBlock chartId={`p.${p.id}.strength`} data={mcChartData(p.strength)} />
                    </div>
                    <Editable id={`p.${p.id}.strength`} value={val(`p.${p.id}.strength`, strengthPara(p.strength))} onChange={onEdit} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        <h3 className="font-bold text-sm mt-6">2. 기타(서술문항) 분석내용</h3>
        {programs.map((p, idx) => (
          <div key={`s-${p.id}`} className="space-y-2 pl-2 border-l-2 border-primary/20">
            <h4 className="font-bold text-foreground">{idx + 1}) {p.programName}</h4>
            <div>
              <p className="font-semibold mb-1">(1) 추후 참여하고 싶은 프로그램 주제</p>
              {p.topic && p.topic.texts.length > 0 ? (
                <ul className="list-disc pl-6 space-y-0.5">
                  {dedupTexts(p.topic.texts).map((t, i) => (
                    <li key={i}>{t.text}{t.count > 1 ? ` (${t.count}건)` : ""}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">응답 없음</p>}
            </div>
            <div>
              <p className="font-semibold mb-1">(2) 소감 및 건의사항</p>
              {p.suggestion && p.suggestion.texts.length > 0 ? (
                <ul className="list-disc pl-6 space-y-0.5">
                  {dedupTexts(p.suggestion.texts).map((t, i) => (
                    <li key={i}>"{t.text}"{t.count > 1 ? ` (${t.count}건)` : ""}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">응답 없음</p>}
            </div>
          </div>
        ))}
      </Section>

      {programs.length >= 2 && (
        <Section title="Ⅴ. 결론 및 제언">
          <div>
            <p className="font-semibold mb-1">1. 분석결과</p>
            <Editable id="v.result" value={resultText} onChange={(_, next) => onResultChange(next)} />
          </div>
          <div>
            <p className="font-semibold mb-1">2. 제언</p>
            <Editable id="v.suggest" value={suggestionText} onChange={(_, next) => onSuggestionChange(next)} />
          </div>
        </Section>
      )}
    </div>
  );
}