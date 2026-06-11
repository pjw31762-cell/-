import { useSyncExternalStore } from "react";
import type { Department } from "@/lib/settings-store";
import type { QuestionDef } from "@/lib/survey-session";

export const DEPARTMENTS: Department[] = ["평생교육팀", "스마트복지팀", "지역복지과"];

/* 보고서 화면이 빈도표를 재구성할 수 있도록 분석 시점에 함께 저장하는 데이터.
   기존 데이터에 없으면 보고서에서는 fallback 으로 안내 처리한다. */
export type StoredAnalysis =
  | {
      no: number;
      text: string;
      type: "mc";
      choices: string[];
      counts: number[]; // choices 와 동일 길이
      total: number;
    }
  | {
      no: number;
      text: string;
      type: "scale";
      rows: string[];
      // row 별 1~5 점 분포 + 평균 + 응답 수
      rowDist: { row: string; dist: number[]; avg: number; n: number }[];
      total: number;
    }
  | { no: number; text: string; type: "subj"; texts: string[] };

export type AnalysisHistoryItem = {
  id: string;
  programName: string;
  dept: string;
  responseCount: number;
  avgSatisfaction: number; // 0 if no scale data
  analyzedAt: string; // YYYY-MM-DD
  reportData: {
    markdown?: string;
    surveyName: string;
    department: string;
    avgScore: number;
    highlights: string[]; // e.g. "주제/내용 4.52"
    topHighlight?: string; // highest-scoring scale row name
    questions?: QuestionDef[]; // 분석 당시 설문 구조 (템플릿 재사용 용도)
    analyses?: StoredAnalysis[]; // 보고서 빈도표용 사전 집계 데이터
  };
};

const keyFor = (dept: string) => `analysisHistory_${dept}`;
const LEGACY_KEY = "analysisHistory";

type DeptKey = string; // department name or "" / "__none__"

const cache = new Map<DeptKey, AnalysisHistoryItem[]>();
const listeners = new Set<() => void>();
let migrated = false;
let allSnapshot: Record<string, AnalysisHistoryItem[]> | null = null;

const loadFor = (dept: DeptKey): AnalysisHistoryItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(keyFor(dept));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const deduped = dedupeItems(parsed as AnalysisHistoryItem[]);
    if (deduped.length !== parsed.length) {
      try {
        localStorage.setItem(keyFor(dept), JSON.stringify(deduped));
      } catch {}
    }
    return deduped;
  } catch {
    return [];
  }
};

const dedupKey = (it: AnalysisHistoryItem) =>
  `${it.programName}__${it.dept}__${it.analyzedAt}`;

const dedupeItems = (items: AnalysisHistoryItem[]): AnalysisHistoryItem[] => {
  const map = new Map<string, AnalysisHistoryItem>();
  for (const it of items) {
    // Last one wins so we keep the most recently saved values.
    map.set(dedupKey(it), it);
  }
  return Array.from(map.values());
};

// One-time migration: split the old single array into per-dept buckets.
const migrateLegacy = () => {
  if (migrated || typeof window === "undefined") return;
  migrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const buckets = new Map<string, AnalysisHistoryItem[]>();
    for (const it of arr as AnalysisHistoryItem[]) {
      const d = (it.dept || "").trim();
      if (!d) continue; // skip items with no dept
      const arr2 = buckets.get(d) ?? [];
      arr2.push(it);
      buckets.set(d, arr2);
    }
    for (const [d, list] of buckets) {
      const existing = loadFor(d);
      // append legacy items that aren't already there
      const merged = [...existing];
      for (const it of list) {
        if (!merged.some((x) => x.id === it.id)) merged.push(it);
      }
      localStorage.setItem(keyFor(d), JSON.stringify(merged));
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
};

const getFor = (dept: DeptKey): AnalysisHistoryItem[] => {
  migrateLegacy();
  if (!cache.has(dept)) cache.set(dept, loadFor(dept));
  return cache.get(dept) ?? [];
};

const persistFor = (dept: DeptKey, next: AnalysisHistoryItem[]) => {
  cache.set(dept, next);
  allSnapshot = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(keyFor(dept), JSON.stringify(next));
    } catch {}
  }
  listeners.forEach((l) => l());
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const analysisHistory = {
  get: (dept: DeptKey): AnalysisHistoryItem[] => getFor(dept),
  getAll: (): Record<string, AnalysisHistoryItem[]> => {
    if (allSnapshot) return allSnapshot;
    const out: Record<string, AnalysisHistoryItem[]> = {};
    for (const d of DEPARTMENTS) out[d] = getFor(d);
    allSnapshot = out;
    return out;
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  add: (
    dept: DeptKey,
    item: Omit<AnalysisHistoryItem, "id" | "analyzedAt" | "dept"> & {
      id?: string;
      analyzedAt?: string;
      dept?: string;
    },
  ) => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const full: AnalysisHistoryItem = {
      id: item.id ?? uuid(),
      analyzedAt: item.analyzedAt ?? dateStr,
      programName: item.programName,
      dept: item.dept ?? dept,
      responseCount: item.responseCount,
      avgSatisfaction: item.avgSatisfaction,
      reportData: item.reportData,
    };
    const existing = getFor(dept);
    const dupIdx = existing.findIndex(
      (h) =>
        h.programName === full.programName &&
        h.dept === full.dept &&
        h.analyzedAt === full.analyzedAt,
    );
    if (dupIdx >= 0) {
      // Replace existing entry, preserve its id so deep links keep working.
      const merged: AnalysisHistoryItem = { ...full, id: existing[dupIdx].id };
      const next = existing.slice();
      next[dupIdx] = merged;
      persistFor(dept, next);
      return merged.id;
    }
    persistFor(dept, [...existing, full]);
    return full.id;
  },
  remove: (dept: DeptKey, id: string) => {
    persistFor(dept, getFor(dept).filter((x) => x.id !== id));
  },
  clear: (dept: DeptKey) => persistFor(dept, []),
  // search by id across all departments — needed by report viewer
  byId: (id: string): AnalysisHistoryItem | undefined => {
    for (const d of DEPARTMENTS) {
      const found = getFor(d).find((x) => x.id === id);
      if (found) return found;
    }
    return undefined;
  },
};

export function useAnalysisHistory(dept: DeptKey): AnalysisHistoryItem[] {
  const getSnap = () => analysisHistory.get(dept);
  return useSyncExternalStore(analysisHistory.subscribe, getSnap, getSnap);
}

export function useAllAnalysisHistory(): Record<string, AnalysisHistoryItem[]> {
  return useSyncExternalStore(
    analysisHistory.subscribe,
    analysisHistory.getAll,
    analysisHistory.getAll,
  );
}

export function formatHistoryDate(s: string): string {
  // YYYY-MM-DD -> YYYY.MM.DD
  return s.replaceAll("-", ".");
}

/* ---------- 프로그램명 정규화 / 동일 프로그램 자동 통합 ---------- */

const QUARTER_RE = /(상반기|하반기|[1-4]\s*분기)/g;
const MONTH_RE = /(1[0-2]|[1-9])\s*월/g;
const ROUND_RE = /(\d+\s*회차|\d+\s*기)/g;

/** 분기·반기·월·회차 표현을 제거한 기본 프로그램명을 반환한다. */
export function baseProgramName(name: string): string {
  if (!name) return "";
  let s = name;
  s = s.replace(QUARTER_RE, " ");
  s = s.replace(MONTH_RE, " ");
  s = s.replace(ROUND_RE, " ");
  // 앞뒤 / 중간 특수문자 정리
  s = s.replace(/[·\-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s || name;
}

export type MergedProgram = {
  id: string;
  programName: string; // 기본명
  sources: string[]; // 통합된 원본 programName 목록
  mergeNote: string; // 예: "1분기·2분기 통합"
  responseCount: number;
  avgSatisfaction: number;
  analyses: StoredAnalysis[];
  questions: QuestionDef[];
  hasData: boolean;
};

function mergeStoredAnalyses(list: StoredAnalysis[][]): StoredAnalysis[] {
  // 같은 (type + text) 끼리 통합한다.
  const buckets = new Map<string, StoredAnalysis[]>();
  for (const group of list) {
    for (const a of group) {
      const k = `${a.type}::${a.text}`;
      const arr = buckets.get(k) ?? [];
      arr.push(a);
      buckets.set(k, arr);
    }
  }
  const out: StoredAnalysis[] = [];
  for (const arr of buckets.values()) {
    const first = arr[0];
    if (first.type === "mc") {
      const same = arr.filter(
        (x): x is Extract<StoredAnalysis, { type: "mc" }> =>
          x.type === "mc" && x.choices.length === first.choices.length &&
          x.choices.every((c, i) => c === first.choices[i]),
      );
      if (!same.length) { out.push(first); continue; }
      const counts = first.choices.map((_, i) =>
        same.reduce((s, x) => s + (x.counts[i] ?? 0), 0));
      const total = same.reduce((s, x) => s + x.total, 0);
      out.push({
        no: first.no, text: first.text, type: "mc",
        choices: first.choices, counts, total,
      });
    } else if (first.type === "scale") {
      const same = arr.filter(
        (x): x is Extract<StoredAnalysis, { type: "scale" }> =>
          x.type === "scale" && x.rows.length === first.rows.length &&
          x.rows.every((r, i) => r === first.rows[i]),
      );
      if (!same.length) { out.push(first); continue; }
      const rowDist = first.rows.map((row, i) => {
        const dist = [0, 0, 0, 0, 0];
        let sum = 0;
        let n = 0;
        for (const x of same) {
          const r = x.rowDist[i];
          if (!r) continue;
          for (let k = 0; k < 5; k++) dist[k] += r.dist[k] ?? 0;
          // r.avg * r.n = sum of values
          sum += (r.avg ?? 0) * (r.n ?? 0);
          n += r.n ?? 0;
        }
        return { row, dist, avg: n ? Number((sum / n).toFixed(2)) : 0, n };
      });
      const total = same.reduce((s, x) => s + x.total, 0);
      out.push({
        no: first.no, text: first.text, type: "scale",
        rows: first.rows, rowDist, total,
      });
    } else {
      const texts = arr.flatMap((x) =>
        x.type === "subj" ? x.texts : []);
      out.push({ no: first.no, text: first.text, type: "subj", texts });
    }
  }
  return out.sort((a, b) => a.no - b.no);
}

/** 분기/월 표현을 떼어낸 기본명이 같은 분석 이력 항목을 통합한다. */
export function mergePrograms(items: AnalysisHistoryItem[]): MergedProgram[] {
  const groups = new Map<string, AnalysisHistoryItem[]>();
  for (const it of items) {
    const key = baseProgramName(it.programName);
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  const out: MergedProgram[] = [];
  for (const [base, arr] of groups) {
    const responseCount = arr.reduce((s, x) => s + x.responseCount, 0);
    // 응답자 수 기준 가중 평균
    const totWeighted = arr.reduce(
      (s, x) => s + x.avgSatisfaction * x.responseCount, 0);
    const avg = responseCount
      ? Number((totWeighted / responseCount).toFixed(2)) : 0;
    const analysesList = arr.map((x) => x.reportData?.analyses ?? []);
    const merged = mergeStoredAnalyses(analysesList);
    // sources: 원본 명 정리 — 기본명을 제거하고 남은 prefix만 보여준다
    const variants = arr
      .map((x) => x.programName.replace(base, "").trim())
      .filter(Boolean);
    const uniqVar = Array.from(new Set(variants));
    const mergeNote = uniqVar.length > 0
      ? `${uniqVar.join("·")} 통합`
      : arr.length > 1 ? `${arr.length}건 통합` : "";
    out.push({
      id: arr.map((x) => x.id).join("+"),
      programName: base,
      sources: arr.map((x) => x.programName),
      mergeNote,
      responseCount,
      avgSatisfaction: avg,
      analyses: merged,
      questions: arr[0].reportData?.questions ?? [],
      hasData: merged.length > 0,
    });
  }
  return out;
}

/* ---------- 템플릿 그룹핑 / 구조 감지 (Settings · Templates 공통) ---------- */

export type HistoryTemplate = {
  sig: string;
  questions: QuestionDef[];
  name: string;
  latest: string;
  count: number;
  mc: number;
  scale: number;
  subj: number;
  preset: "A" | "B" | "custom";
};

export function detectPresetFromQuestions(
  qs: QuestionDef[],
): "A" | "B" | "custom" {
  if (!qs || qs.length === 0) return "custom";
  const mc = qs.filter((q) => q.type === "mc").length;
  const scale = qs.filter((q) => q.type === "scale").length;
  const subj = qs.filter((q) => q.type === "subj").length;
  if (mc === 4 && scale === 1 && subj === 2) return "A";
  if (mc === 3 && scale === 1 && subj === 2) return "B";
  return "custom";
}

const sigOfQuestions = (qs: QuestionDef[]) =>
  qs
    .map((q) =>
      q.type === "mc"
        ? `mc::${q.text}::${q.choices.join("|")}`
        : q.type === "scale"
          ? `scale::${q.text}::${q.rows.join("|")}`
          : `subj::${q.text}`,
    )
    .join("\n");

export function groupHistoryTemplates(
  history: AnalysisHistoryItem[],
): HistoryTemplate[] {
  const groups = new Map<string, HistoryTemplate>();
  for (const h of history) {
    const qs = h.reportData?.questions ?? [];
    const sig = qs.length ? sigOfQuestions(qs) : `__legacy__${h.programName}`;
    const ex = groups.get(sig);
    if (!ex) {
      groups.set(sig, {
        sig,
        questions: qs,
        name: h.programName,
        latest: h.analyzedAt,
        count: 1,
        mc: qs.filter((q) => q.type === "mc").length,
        scale: qs.filter((q) => q.type === "scale").length,
        subj: qs.filter((q) => q.type === "subj").length,
        preset: detectPresetFromQuestions(qs),
      });
    } else {
      ex.count += 1;
      if (h.analyzedAt > ex.latest) {
        ex.latest = h.analyzedAt;
        ex.name = h.programName;
      }
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0,
  );
}