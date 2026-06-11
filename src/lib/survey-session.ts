import { useSyncExternalStore } from "react";

export type StructureType = "A" | "B" | "custom";

// 문항 식별 키 — STEP 1 에서 선택한 항목이 STEP 2·3·4 에 그대로 반영됩니다.
export type QuestionKey =
  | "gender"
  | "age"
  | "path"
  | "strength"
  | "scale"
  | "topic"
  | "suggestion";

export const ALL_QUESTION_KEYS: QuestionKey[] = [
  "gender",
  "age",
  "path",
  "scale",
  "strength",
  "topic",
  "suggestion",
];

export const QUESTION_KEY_LABELS: Record<QuestionKey, string> = {
  gender: "성별",
  age: "연령",
  path: "참여경로",
  strength: "프로그램 강점",
  scale: "5점 척도 (세부 만족도)",
  topic: "추후 희망 주제 (주관식)",
  suggestion: "소감 및 건의사항 (주관식)",
};

export type SurveyStructure = {
  type: StructureType;
  label: string;
  includedKeys: QuestionKey[]; // 포함할 문항 키 (표시 순서대로 정렬됨)
  scaleRows: number;            // 5점 척도 평가항목(행) 개수
  customMcQuestions?: string[]; // 직접 선택 구조에서 추가한 커스텀 객관식 문항명
  customScaleItems?: string[];  // 직접 선택 구조에서 추가한 커스텀 5점 척도 평가항목
  selectedScaleStdItems?: string[]; // 직접 선택 구조에서 체크된 표준 5점 척도 평가항목
  customSubjQuestions?: string[]; // 직접 선택 구조에서 추가한 커스텀 주관식 문항
  subjectiveLabels?: { topic?: string; suggestion?: string }; // 주관식 문항명 커스터마이즈
};

export type QuestionDef =
  | { no: number; type: "mc"; text: string; choices: string[] }
  | { no: number; type: "scale"; text: string; rows: string[] } // 5점 척도
  | { no: number; type: "subj"; text: string };

export type ResponseAnswer =
  | { type: "mc"; choiceIndex: number | null; confidence: number }
  | { type: "scale"; scores: Record<string, number | null>; confidence: number } // row → 1~5
  | { type: "subj"; text: string; confidence: number };

export type SurveyResponse = {
  id: string;
  source: string; // 파일명
  uploadedAt: number;
  answers: Record<number, ResponseAnswer>; // 문항 번호 → 답
};

export type SessionState = {
  structure: SurveyStructure | null;
  questions: QuestionDef[];
  responses: SurveyResponse[];
  surveyName: string;
  department: string;
  scaleRowLabels: string[];
  strengthChoices: string[];
};

const STORAGE_KEY = "satisai.session.v1";

export const DEFAULT_SCALE_ROWS = [
  "주제/내용",
  "강사 전문성",
  "교육수준",
  "교육방법",
  "소요시간",
];

export const DEFAULT_STRENGTH_CHOICES = [
  "인지기능 향상",
  "신체기능 향상",
  "정서적 안정",
  "사회적 교류",
  "디지털 활용능력",
];

const sortKeys = (keys: QuestionKey[]) =>
  [...new Set(keys)].sort(
    (a, b) => ALL_QUESTION_KEYS.indexOf(a) - ALL_QUESTION_KEYS.indexOf(b),
  );

const defaultQuestions = (
  s: SurveyStructure,
  scaleRowLabels: string[],
  strengthChoices: string[],
): QuestionDef[] => {
  const rows: string[] = [];
  const rowCount = s.scaleRows || scaleRowLabels.length || 5;
  for (let i = 0; i < rowCount; i++) {
    rows.push(scaleRowLabels[i] ?? DEFAULT_SCALE_ROWS[i] ?? `평가항목 ${i + 1}`);
  }
  const strengths = strengthChoices.length ? strengthChoices : DEFAULT_STRENGTH_CHOICES;
  const keys = sortKeys(s.includedKeys ?? []);
  const customMcs = (s.customMcQuestions ?? []).map((t) => t.trim()).filter(Boolean);
  const subjLabels = s.subjectiveLabels ?? {};
  const customSubjs = (s.customSubjQuestions ?? []).map((t) => t.trim()).filter(Boolean);
  const isCustom = s.type === "custom";
  const customScaleRows = isCustom
    ? [
        ...((s.selectedScaleStdItems ?? []).map((t) => t.trim()).filter(Boolean)),
        ...((s.customScaleItems ?? []).map((t) => t.trim()).filter(Boolean)),
      ]
    : null;
  const qs: QuestionDef[] = [];
  let no = 1;
  let customInjected = false;
  const injectCustomMcs = () => {
    if (customInjected) return;
    customInjected = true;
    for (const text of customMcs) {
      qs.push({
        no: no++,
        type: "mc",
        text,
        choices: ["선택 1", "선택 2", "선택 3", "선택 4"],
      });
    }
  };
  for (const key of keys) {
    // 커스텀 객관식 문항은 표준 객관식 다음, 5점 척도/주관식 앞에 배치
    if (key === "scale" || key === "topic" || key === "suggestion") injectCustomMcs();
    switch (key) {
      case "gender":
        qs.push({ no: no++, type: "mc", text: "귀하의 성별은 무엇입니까?", choices: ["남자", "여자"] });
        break;
      case "age":
        qs.push({ no: no++, type: "mc", text: "귀하의 연령은 어떻게 되십니까?", choices: ["60대", "70대", "80대", "90대"] });
        break;
      case "path":
        qs.push({
          no: no++, type: "mc",
          text: "본 프로그램에 대해 어떻게 알고 참여하시게 되었습니까?",
          choices: ["카카오톡 메시지", "관내 홍보", "홈페이지", "지인 추천", "직원 추천"],
        });
        break;
      case "strength":
        qs.push({
          no: no++, type: "mc",
          text: "참여하신 프로그램의 가장 큰 강점은 무엇입니까?",
          choices: strengths,
        });
        break;
      case "scale":
        if (customScaleRows) {
          if (customScaleRows.length === 0) break;
          qs.push({
            no: no++, type: "scale",
            text: "귀하가 참여하신 프로그램에 만족하십니까?",
            rows: customScaleRows,
          });
          break;
        }
        qs.push({
          no: no++, type: "scale",
          text: "귀하가 참여하신 프로그램에 만족하십니까?",
          rows,
        });
        break;
      case "topic":
        qs.push({
          no: no++, type: "subj",
          text: (subjLabels.topic?.trim()) || "추후 참여하고 싶은 프로그램 주제가 있다면 적어주세요.",
        });
        break;
      case "suggestion":
        qs.push({
          no: no++, type: "subj",
          text: (subjLabels.suggestion?.trim()) || "프로그램과 관련한 소감 및 건의사항이 있다면 적어주세요.",
        });
        break;
    }
  }
  // 척도/주관식이 하나도 없을 때를 대비해 마지막에 한 번 더 주입
  injectCustomMcs();
  // 직접 선택 구조의 커스텀 주관식 문항을 마지막에 추가
  for (const text of customSubjs) {
    qs.push({ no: no++, type: "subj", text });
  }
  return qs;
};

const emptyState = (): SessionState => ({
  structure: null,
  questions: [],
  responses: [],
  surveyName: "신규 만족도 조사",
  department: "평생교육팀",
  scaleRowLabels: [...DEFAULT_SCALE_ROWS],
  strengthChoices: [...DEFAULT_STRENGTH_CHOICES],
});

let state: SessionState = emptyState();
let initialized = false;
const listeners = new Set<() => void>();

const load = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...emptyState(), ...JSON.parse(raw) };
  } catch {}
  initialized = true;
};

const persist = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

const set = (patch: Partial<SessionState>) => {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
};

export const surveySession = {
  get: () => {
    if (!initialized) load();
    // 구버전 저장 데이터 호환 (includedKeys 없음 → 전체 포함)
    if (state.structure && !Array.isArray((state.structure as any).includedKeys)) {
      state = {
        ...state,
        structure: {
          ...state.structure,
          includedKeys: [...ALL_QUESTION_KEYS],
        } as SurveyStructure,
      };
    }
    return state;
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setStructure: (
    s: SurveyStructure,
    opts?: { scaleRowLabels?: string[]; strengthChoices?: string[] },
  ) => {
    const scaleRowLabels = opts?.scaleRowLabels ?? state.scaleRowLabels;
    const strengthChoices = opts?.strengthChoices ?? state.strengthChoices;
    const normalized: SurveyStructure = {
      ...s,
      includedKeys: sortKeys(s.includedKeys ?? []),
      customMcQuestions: (s.customMcQuestions ?? []).map((t) => t.trim()).filter(Boolean),
      customScaleItems: (s.customScaleItems ?? []).map((t) => t.trim()).filter(Boolean),
      selectedScaleStdItems: (s.selectedScaleStdItems ?? []).map((t) => t.trim()).filter(Boolean),
      customSubjQuestions: (s.customSubjQuestions ?? []).map((t) => t.trim()).filter(Boolean),
      subjectiveLabels: {
        topic: s.subjectiveLabels?.topic?.trim() || undefined,
        suggestion: s.subjectiveLabels?.suggestion?.trim() || undefined,
      },
    };
    const questions = defaultQuestions(normalized, scaleRowLabels, strengthChoices);
    set({ structure: normalized, questions, responses: [], scaleRowLabels, strengthChoices });
  },
  setMeta: (surveyName: string, department: string) => set({ surveyName, department }),
  addResponse: (r: SurveyResponse) => set({ responses: [...state.responses, r] }),
  updateAnswer: (responseId: string, no: number, answer: ResponseAnswer) => {
    const responses = state.responses.map((r) =>
      r.id === responseId ? { ...r, answers: { ...r.answers, [no]: answer } } : r,
    );
    set({ responses });
  },
  deleteResponse: (responseId: string) => {
    set({ responses: state.responses.filter((r) => r.id !== responseId) });
  },
  clearResponses: () => set({ responses: [] }),
  reset: () => set(emptyState()),
  resetForNewSurvey: () => {
    // 새 분석 시작 시 호출 — 이전 분석에서 누적된 모든 상태값을 초기화한다.
    // 단, 설정 화면에 저장된 템플릿·기본값은 별도 store에 있으므로 영향받지 않음.
    const fresh = emptyState();
    set({
      structure: null,
      questions: [],
      responses: [],
      scaleRowLabels: [...DEFAULT_SCALE_ROWS],
      strengthChoices: [...DEFAULT_STRENGTH_CHOICES],
      surveyName: fresh.surveyName,
    });
  },
  // 템플릿에서 기존 설문 구조(questions)를 그대로 불러올 때 사용한다.
  loadFromTemplate: (questions: QuestionDef[], surveyName?: string) => {
    set({
      structure: {
        type: "custom",
        label: "템플릿 불러오기",
        includedKeys: [],
        scaleRows: 0,
      },
      questions: [...questions],
      responses: [],
      ...(surveyName ? { surveyName } : {}),
    });
  },
};

export function useSurveySession(): SessionState {
  return useSyncExternalStore(
    surveySession.subscribe,
    surveySession.get,
    surveySession.get,
  );
}

export const STRUCTURE_PRESETS: Record<"A" | "B", SurveyStructure> = {
  A: {
    type: "A",
    label: "구조 A · 표준",
    includedKeys: ["gender", "age", "path", "strength", "scale", "topic", "suggestion"],
    scaleRows: 5,
  },
  B: {
    type: "B",
    label: "구조 B · 축약",
    includedKeys: ["gender", "age", "path", "scale", "topic", "suggestion"],
    scaleRows: 5,
  },
};