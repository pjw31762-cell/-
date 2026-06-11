import { useSyncExternalStore } from "react";

export type DownloadFormat = "hwp" | "xlsx" | "pdf";
export type Department = "평생교육팀" | "스마트복지팀" | "지역복지과";

export type StructureTemplate = {
  id: string;
  name: string;
  dept?: string;
  structure: unknown; // SurveyStructure
  scaleRowLabels: string[];
  strengthChoices: string[];
  savedAt: number;
  lastUsedAt?: number;
  counts: { mc: number; scale: number; subj: number };
};

export type AppSettings = {
  userName: string; // override of Google display name (empty = use Google)
  department: Department | "";
  orgName: string;
  reportYear: string;
  downloadFormat: DownloadFormat;
  notif: {
    analysisDone: boolean;
    reviewRequest: boolean;
    reportDone: boolean;
  };
  templates: StructureTemplate[];
};

const KEY = "sws.settings.v1";
const EVT = "sws:settings-updated";

const defaults = (): AppSettings => ({
  userName: "",
  department: (typeof window !== "undefined"
    ? (localStorage.getItem("selectedDept") as Department | null)
    : null) || "",
  orgName: "강남시니어플라자",
  reportYear: String(new Date().getFullYear()),
  downloadFormat: "hwp",
  notif: { analysisDone: true, reviewRequest: true, reportDone: false },
  templates: [],
});

let state: AppSettings = defaults();
let initialized = false;
const listeners = new Set<() => void>();

const load = () => {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...defaults(), ...JSON.parse(raw) };
    // Backfill department from selectedDept legacy key
    const dept = localStorage.getItem("selectedDept");
    if (dept && !state.department) state.department = dept as Department;
  } catch {}
  initialized = true;
};

const persist = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (state.department) localStorage.setItem("selectedDept", state.department);
    window.dispatchEvent(new Event(EVT));
  } catch {}
};

const notify = () => listeners.forEach((l) => l());

export const settingsStore = {
  get: (): AppSettings => {
    if (!initialized) load();
    return state;
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  update: (patch: Partial<AppSettings>) => {
    state = { ...state, ...patch };
    persist();
    notify();
  },
  addTemplate: (t: StructureTemplate) => {
    state = { ...state, templates: [t, ...state.templates] };
    persist();
    notify();
  },
  removeTemplate: (id: string) => {
    state = { ...state, templates: state.templates.filter((t) => t.id !== id) };
    persist();
    notify();
  },
  touchTemplate: (id: string) => {
    state = {
      ...state,
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, lastUsedAt: Date.now() } : t,
      ),
    };
    persist();
    notify();
  },
};

if (typeof window !== "undefined") {
  window.addEventListener(EVT, () => {
    // re-read from storage so multiple tabs / hooks stay in sync
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = { ...defaults(), ...JSON.parse(raw) };
    } catch {}
    notify();
  });
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

export const SETTINGS_EVENT = EVT;