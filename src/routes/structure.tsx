import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import {
  DEFAULT_SCALE_ROWS,
  surveySession,
  useSurveySession,
  type QuestionDef,
} from "@/lib/survey-session";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { settingsStore, useSettings } from "@/lib/settings-store";

export const Route = createFileRoute("/structure")({
  head: () => ({ meta: [{ title: "설문 구조 선택 · SatisAI" }] }),
  component: StructurePage,
});

type McItem = { id: string; label: string; choices: string[] | null }; // null = auto-recognized
type ScaleItem = { id: string; label: string; items: string[] };
type SubjItem = { id: string; label: string };

const AUTO_LABELS = new Set(["성별", "연령"]);
const MC_SUGGESTIONS = [
  "참여경로",
  "프로그램 강점",
  "거주 지역",
  "이용 기간",
  "참여 동기",
];
const DEFAULT_PATH_CHOICES = [
  "카카오톡 메시지",
  "관내 홍보",
  "홈페이지",
  "지인 추천",
  "직원 추천",
];

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const STRENGTH_LABEL = "강점";
const DEFAULT_STRENGTH_ITEMS = [
  "시대흐름 반영주제",
  "스마트폰 활용능력 향상",
  "강사의 전문성",
  "교육 진행 방법",
  "일상생활 개선/도움",
];
const isStrengthLabel = (s: string) => {
  const t = s.trim();
  return t === STRENGTH_LABEL || t === "프로그램 강점";
};
const makeStrengthItem = (): McItem => ({
  id: uid(),
  label: STRENGTH_LABEL,
  choices: [...DEFAULT_STRENGTH_ITEMS],
});

const defaultChoicesFor = (label: string): string[] => {
  const t = label.trim();
  if (t === "참여경로") return [...DEFAULT_PATH_CHOICES];
  if (t === STRENGTH_LABEL || t === "프로그램 강점")
    return [...DEFAULT_STRENGTH_ITEMS];
  if (t === "거주 지역") return ["관내 거주", "관외 거주"];
  if (t === "이용 기간") return ["6개월 미만", "6개월~1년", "1~3년", "3년 이상"];
  if (t === "참여 동기")
    return ["자기계발", "건강 증진", "사회적 교류", "여가 활용", "기타"];
  return ["선택 1", "선택 2", "선택 3", "선택 4"];
};

type PresetKey = "standard" | "scale_subj" | "area" | "custom";

// 척도·서술형(정서지원 등) 기본 평가항목 — 문장형 만족도 진술
const STATEMENT_SCALE_ITEMS = [
  "프로그램 참여 시간(횟수)은 적절했다",
  "프로그램 진행(강사)에 만족한다",
  "프로그램을 통해 도움·만족감을 얻었다",
  "향후 동일·유사 프로그램에 다시 참여할 의향이 있다",
  "프로그램에 대해 전반적으로 만족한다",
];

// 영역별 평가형(선배시민 필수교육 등) 기본 평가항목
const AREA_INSTRUCTOR_ITEMS = [
  "강사의 준비(내용·자료)",
  "강사의 진행(발음·속도)",
  "강사의 태도(적극·명확)",
];
const AREA_EDU_ITEMS = [
  "교육 내용 이해도",
  "교육 시간 적절성",
  "자원봉사(활동) 도움 정도",
];

// 카드별 표시 섹션 — 선택형 / 5점 척도 / 강점 / 자유 서술
const SECTION_VISIBILITY: Record<
  PresetKey,
  { mc: boolean; scale: boolean; strength: boolean; subj: boolean }
> = {
  standard: { mc: true, scale: true, strength: true, subj: true },
  scale_subj: { mc: false, scale: true, strength: false, subj: true },
  area: { mc: false, scale: true, strength: false, subj: true },
  custom: { mc: true, scale: true, strength: true, subj: true },
};

const presetStandard = () => ({
  mc: [
    { id: uid(), label: "성별", choices: null },
    { id: uid(), label: "연령", choices: null },
    { id: uid(), label: "참여경로", choices: [...DEFAULT_PATH_CHOICES] },
  ] as McItem[],
  scale: [
    { id: uid(), label: "세부만족도", items: [...DEFAULT_SCALE_ROWS] },
  ] as ScaleItem[],
  strength: [makeStrengthItem()] as McItem[],
  subj: [
    { id: uid(), label: "추후 희망 주제" },
    { id: uid(), label: "소감 및 건의사항" },
  ] as SubjItem[],
});

const presetScaleSubj = () => ({
  mc: [] as McItem[],
  scale: [
    { id: uid(), label: "프로그램 만족도", items: [...STATEMENT_SCALE_ITEMS] },
  ] as ScaleItem[],
  strength: [] as McItem[],
  subj: [{ id: uid(), label: "건의사항" }] as SubjItem[],
});

const presetArea = () => ({
  mc: [] as McItem[],
  scale: [
    { id: uid(), label: "강사 만족도", items: [...AREA_INSTRUCTOR_ITEMS] },
    { id: uid(), label: "교육 만족도", items: [...AREA_EDU_ITEMS] },
  ] as ScaleItem[],
  strength: [] as McItem[],
  subj: [
    { id: uid(), label: "강사에 대해 가장 만족한 부분은?" },
    { id: uid(), label: "교육에서 가장 만족한 부분은?" },
    { id: uid(), label: "건의사항 및 느낀 점" },
  ] as SubjItem[],
});

function StructurePage() {
  const session = useSurveySession();
  const appSettings = useSettings();
  const navigate = useNavigate();

  const init = (() => {
    const qs = session.questions;
    if (qs && qs.length > 0) {
      const mc: McItem[] = [];
      const scale: ScaleItem[] = [];
      const strength: McItem[] = [];
      const subj: SubjItem[] = [];
      for (const q of qs) {
        if (q.type === "mc") {
          const auto = AUTO_LABELS.has(q.text.trim());
          const row: McItem = {
            id: uid(),
            label: q.text,
            choices: auto ? null : [...q.choices],
          };
          if (isStrengthLabel(q.text)) {
            // 라벨을 통일하고 강점 섹션으로 분리
            strength.push({ ...row, label: STRENGTH_LABEL });
          } else {
            mc.push(row);
          }
        } else if (q.type === "scale") {
          scale.push({ id: uid(), label: q.text, items: [...q.rows] });
        } else if (q.type === "subj") {
          subj.push({ id: uid(), label: q.text });
        }
      }
      // 템플릿/세션에서 불러온 경우 — 사용자가 직접 편집한 상태로 간주
      return { selected: "custom" as PresetKey, mc, scale, strength, subj };
    }
    const a = presetStandard();
    return { selected: "standard" as PresetKey, ...a };
  })();

  const [selected, setSelected] = useState<PresetKey>(init.selected);
  const [mcs, setMcs] = useState<McItem[]>(init.mc);
  const [scales, setScales] = useState<ScaleItem[]>(init.scale);
  const [strengths, setStrengths] = useState<McItem[]>(init.strength);
  const [subjs, setSubjs] = useState<SubjItem[]>(init.subj);
  const [surveyName, setSurveyName] = useState(session.surveyName);
  const [department, setDepartment] = useState(
    appSettings.department || session.department || "평생교육팀",
  );

  const applyPreset = (k: PresetKey) => {
    setSelected(k);
    let p;
    if (k === "standard") p = presetStandard();
    else if (k === "scale_subj") p = presetScaleSubj();
    else if (k === "area") p = presetArea();
    else {
      p = {
        mc: [
          { id: uid(), label: "성별", choices: null },
          { id: uid(), label: "연령", choices: null },
        ] as McItem[],
        scale: [
          { id: uid(), label: "세부만족도", items: [...DEFAULT_SCALE_ROWS] },
        ] as ScaleItem[],
        strength: [makeStrengthItem()] as McItem[],
        subj: [{ id: uid(), label: "추후 희망 주제" }] as SubjItem[],
      };
    }
    setMcs(p.mc);
    setScales(p.scale);
    setStrengths(p.strength);
    setSubjs(p.subj);
  };

  // user edits → switch selected to "custom"
  const markCustom = () => {
    if (selected !== "custom") setSelected("custom");
  };

  const buildQuestions = (): QuestionDef[] => {
    const out: QuestionDef[] = [];
    let no = 1;
    // mcs 에는 일반 객관식만, strengths 에는 강점 객관식만 들어있다.
    const generalMcs = mcs.filter((m) => !isStrengthLabel(m.label));
    const strengthMcs = strengths;
    const emitMc = (m: McItem) => {
      const t = m.label.trim();
      if (!t) return;
      let choices: string[];
      if (m.choices == null) {
        if (t === "성별") choices = ["남자", "여자"];
        else if (t === "연령") choices = ["60대", "70대", "80대", "90대"];
        else choices = ["선택 1", "선택 2", "선택 3", "선택 4"];
      } else {
        choices = m.choices.map((c) => c.trim()).filter(Boolean);
        if (choices.length === 0) choices = ["선택 1", "선택 2"];
      }
      out.push({ no: no++, type: "mc", text: t, choices });
    };
    for (const m of generalMcs) emitMc(m);
    for (const s of scales) {
      const t = s.label.trim();
      if (!t) continue;
      const rows = s.items.map((c) => c.trim()).filter(Boolean);
      if (rows.length === 0) continue;
      out.push({ no: no++, type: "scale", text: t, rows });
    }
    // 강점 문항은 5점 척도 바로 다음
    for (const m of strengthMcs) emitMc(m);
    for (const s of subjs) {
      const t = s.label.trim();
      if (!t) continue;
      out.push({ no: no++, type: "subj", text: t });
    }
    return out;
  };

  const questions = buildQuestions();
  const totalCount = questions.length;

  // duplicate detection
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const labels = [
    ...mcs.map((m) => m.label),
    ...scales.map((s) => s.label),
    ...strengths.map((m) => m.label),
    ...subjs.map((s) => s.label),
  ];
  const counts = new Map<string, number>();
  for (const l of labels) {
    const k = norm(l);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const isDup = (v: string) => {
    const k = norm(v);
    return !!k && (counts.get(k) ?? 0) > 1;
  };
  const hasAnyDup = Array.from(counts.values()).some((c) => c > 1);

  const confirm = () => {
    surveySession.setMeta(surveyName, department);
    surveySession.loadFromTemplate(questions, surveyName);
    navigate({ to: "/upload" });
  };

  const [tplModal, setTplModal] = useState(false);
  const [tplName, setTplName] = useState("");
  const saveAsTemplate = () => {
    const name = tplName.trim();
    if (!name) return;
    const mcCount =
      mcs.filter((m) => m.label.trim()).length +
      strengths.filter((m) => m.label.trim()).length;
    const scaleCount = scales.filter((s) => s.label.trim()).length;
    const subjCount = subjs.filter((s) => s.label.trim()).length;
    settingsStore.addTemplate({
      id: `tpl_${Date.now()}`,
      name,
      dept: settingsStore.get().department || undefined,
      structure: {
        type: "custom",
        label: name,
        includedKeys: [],
        scaleRows: scaleCount,
      },
      scaleRowLabels: scales[0]?.items ?? DEFAULT_SCALE_ROWS,
      strengthChoices:
        strengths[0]?.choices ?? DEFAULT_STRENGTH_ITEMS,
      savedAt: Date.now(),
      counts: { mc: mcCount, scale: scaleCount, subj: subjCount },
    });
    setTplModal(false);
    setTplName("");
    toast.success("템플릿이 저장되었습니다");
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="1단계"
        title="설문지 구조 선택"
        description="아래에서 설문지 형태를 선택하세요. 선택한 형태에 맞게 응답 내용을 자동으로 분석합니다."
      />
      <p className="-mt-4 mb-6 flex items-start gap-1.5 text-sm text-slate-500">
        <span aria-hidden>💡</span>
        <span>
          이전에 사용한 설문 구조를 다시 사용하려면{" "}
          <Link
            to="/settings"
            search={{ tab: "templates" }}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            설정 → 설문 템플릿
          </Link>
          에서 해당 프로그램의 [불러오기]를 클릭하세요.
        </span>
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-xs font-medium text-muted-foreground dark:text-gray-300">
            사업명
          </label>
          <input
            value={surveyName}
            onChange={(e) => setSurveyName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500"
          />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <label className="text-xs font-medium text-muted-foreground dark:text-gray-300">
            담당 부서
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500"
          >
            <option>평생교육팀</option>
            <option>스마트복지팀</option>
            <option>지역복지과</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <PresetCard
          icon={<ListChecks className="h-5 w-5" />}
          title="표준형"
          subtitle="성별·연령·참여경로 + 5점 척도 + 강점 + 주관식 2"
          tag="예: 스마트에이징특강, VR 체험 등 (척도 항목만 수정해 사용)"
          active={selected === "standard"}
          onClick={() => applyPreset("standard")}
        />
        <PresetCard
          icon={<ListChecks className="h-5 w-5" />}
          title="척도·서술형"
          subtitle="인적사항 없이 문장형 만족도 척도 + 건의사항"
          tag="예: 정서지원사업 등 척도 중심 설문"
          active={selected === "scale_subj"}
          onClick={() => applyPreset("scale_subj")}
        />
        <PresetCard
          icon={<ListChecks className="h-5 w-5" />}
          title="영역별 평가형"
          subtitle="강사·교육 영역별 척도 + 영역별 주관식"
          tag="예: 선배시민 필수교육 등 영역 구분 설문"
          active={selected === "area"}
          onClick={() => applyPreset("area")}
        />
        <PresetCard
          icon={<SlidersHorizontal className="h-5 w-5" />}
          title="직접 구성하기"
          subtitle="문항을 자유롭게 추가·편집"
          tag="위 양식에 없는 새 설문 직접 구성"
          active={selected === "custom"}
          onClick={() => applyPreset("custom")}
        />
      </div>

      {/* 통합 편집 영역 */}
      <div className="mt-8 space-y-6">
        {SECTION_VISIBILITY[selected].mc && (
        <EditorSection title="선택형 문항" countLabel={`${mcs.length}문항`}>
          <div className="space-y-2">
            {mcs.map((m, i) => (
              <McRow
                key={m.id}
                index={i + 1}
                item={m}
                dup={isDup(m.label)}
                onChange={(next) => {
                  markCustom();
                  setMcs((prev) => prev.map((x) => (x.id === m.id ? next : x)));
                }}
                onRemove={() => {
                  markCustom();
                  setMcs((prev) => prev.filter((x) => x.id !== m.id));
                }}
              />
            ))}
          </div>
          <AddBtn
            label="문항 추가"
            onClick={() => {
              markCustom();
              setMcs((prev) => [
                ...prev,
                { id: uid(), label: "", choices: [...defaultChoicesFor("")] },
              ]);
            }}
          />
        </EditorSection>
        )}

        {SECTION_VISIBILITY[selected].scale && (
        <EditorSection title="5점 척도 문항" countLabel={`${scales.length}문항`}>
          <div className="space-y-2">
            {scales.map((s, i) => (
              <ScaleRow
                key={s.id}
                index={i + 1}
                item={s}
                dup={isDup(s.label)}
                onChange={(next) => {
                  markCustom();
                  setScales((prev) => prev.map((x) => (x.id === s.id ? next : x)));
                }}
                onRemove={() => {
                  markCustom();
                  setScales((prev) => prev.filter((x) => x.id !== s.id));
                }}
              />
            ))}
          </div>
          <AddBtn
            label="문항 추가"
            onClick={() => {
              markCustom();
              setScales((prev) => [
                ...prev,
                { id: uid(), label: "", items: [""] },
              ]);
            }}
          />
        </EditorSection>
        )}

        {SECTION_VISIBILITY[selected].strength && (
        <EditorSection title="강점 문항" countLabel={`${strengths.length}문항`}>
          <div className="space-y-2">
            {strengths.map((m, i) => (
              <StrengthRow
                key={m.id}
                index={i + 1}
                item={m}
                dup={isDup(m.label)}
                onChange={(next) => {
                  markCustom();
                  setStrengths((prev) =>
                    prev.map((x) => (x.id === m.id ? next : x)),
                  );
                }}
                onRemove={() => {
                  markCustom();
                  setStrengths((prev) => prev.filter((x) => x.id !== m.id));
                }}
              />
            ))}
          </div>
          <AddBtn
            label="문항 추가"
            onClick={() => {
              markCustom();
              setStrengths((prev) => [
                ...prev,
                {
                  id: uid(),
                  label: STRENGTH_LABEL,
                  choices: [...DEFAULT_STRENGTH_ITEMS],
                },
              ]);
            }}
          />
        </EditorSection>
        )}

        {SECTION_VISIBILITY[selected].subj && (
        <EditorSection title="자유 서술 문항" countLabel={`${subjs.length}문항`}>
          <div className="space-y-2">
            {subjs.map((s, i) => (
              <SubjRow
                key={s.id}
                index={i + 1}
                item={s}
                dup={isDup(s.label)}
                onChange={(next) => {
                  markCustom();
                  setSubjs((prev) => prev.map((x) => (x.id === s.id ? next : x)));
                }}
                onRemove={() => {
                  markCustom();
                  setSubjs((prev) => prev.filter((x) => x.id !== s.id));
                }}
              />
            ))}
          </div>
          <AddBtn
            label="문항 추가"
            onClick={() => {
              markCustom();
              setSubjs((prev) => [...prev, { id: uid(), label: "" }]);
            }}
          />
        </EditorSection>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-2xl border border-border bg-card p-5 dark:bg-gray-800 dark:border-gray-600">
        <div className="text-sm">
          <div className="font-medium dark:text-gray-100">선택된 구조</div>
          <div className="mt-1 text-xs text-muted-foreground dark:text-gray-200">
            총 {totalCount} 문항
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTplModal(true)}
            disabled={totalCount === 0 || hasAnyDup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-40 dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500"
          >
            <Save className="h-4 w-4" /> 이 구조 저장해두기
          </button>
          <div className="flex flex-col items-end gap-1">
            {hasAnyDup && (
              <div className="text-xs font-medium text-red-500">
                중복된 항목이 있습니다. 수정 후 진행해 주세요.
              </div>
            )}
            <button
              onClick={confirm}
              disabled={totalCount === 0 || hasAnyDup}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              완료 → 다음 단계로 <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {tplModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
            <div className="text-base font-semibold">템플릿으로 저장</div>
            <p className="mt-1 text-sm text-muted-foreground">템플릿 이름을 입력하세요.</p>
            <input
              autoFocus
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="예: VR 세계여행 체험 프로그램"
              className="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setTplModal(false);
                  setTplName("");
                }}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
              >
                취소
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!tplName.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PresetCard({
  icon,
  title,
  subtitle,
  tag,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tag?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group cursor-pointer rounded-2xl border p-6 text-left transition-all ${
        active
          ? "border-primary bg-primary-soft/40 shadow-[var(--shadow-elevated)] dark:bg-gray-600 dark:border-gray-500"
          : "border-border bg-card hover:border-primary/40 dark:bg-gray-700 dark:border-gray-500"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-accent-foreground">
          {icon}
        </div>
        {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
      </div>
      <div className="mt-4 text-sm font-semibold dark:text-gray-100">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground dark:text-gray-300">{subtitle}</div>
      {tag && (
        <div className="mt-4 rounded-md bg-secondary px-2.5 py-1.5 text-[10px] text-muted-foreground dark:bg-gray-500 dark:text-gray-100">
          {tag}
        </div>
      )}
    </div>
  );
}

function EditorSection({
  title,
  countLabel,
  children,
}: {
  title: string;
  countLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 dark:bg-gray-700 dark:border-gray-500">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold dark:text-gray-100">{title}</div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground dark:bg-gray-600 dark:text-gray-200">
          {countLabel}
        </span>
      </div>
      {children}
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function RowIndex({ n }: { n: number }) {
  return (
    <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{n}.</span>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-secondary"
      title="삭제"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function McRow({
  index,
  item,
  dup,
  onChange,
  onRemove,
}: {
  index: number;
  item: McItem;
  dup: boolean;
  onChange: (next: McItem) => void;
  onRemove: () => void;
}) {
  const [showChoices, setShowChoices] = useState(false);
  const [showSugg, setShowSugg] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setShowSugg(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isAuto = AUTO_LABELS.has(item.label.trim());

  const handleLabelChange = (v: string) => {
    const trimmed = v.trim();
    if (AUTO_LABELS.has(trimmed)) {
      onChange({ ...item, label: v, choices: null });
    } else if (item.choices == null) {
      onChange({ ...item, label: v, choices: defaultChoicesFor(trimmed) });
    } else {
      onChange({ ...item, label: v });
    }
  };

  const pickSuggestion = (s: string) => {
    onChange({ ...item, label: s, choices: defaultChoicesFor(s) });
    setShowSugg(false);
  };

  const q = item.label.trim().toLowerCase();
  const suggestions = MC_SUGGESTIONS.filter(
    (s) => !q || s.toLowerCase().includes(q),
  );

  const updateChoice = (i: number, v: string) => {
    const next = [...(item.choices ?? [])];
    next[i] = v;
    onChange({ ...item, choices: next });
  };
  const removeChoice = (i: number) => {
    const next = (item.choices ?? []).filter((_, idx) => idx !== i);
    onChange({ ...item, choices: next });
  };
  const addChoice = () =>
    onChange({ ...item, choices: [...(item.choices ?? []), ""] });

  return (
    <div className="rounded-lg border border-border bg-background p-2.5 dark:bg-gray-600 dark:border-gray-500">
      <div className="flex items-center gap-2" ref={wrapRef}>
        <RowIndex n={index} />
        <div className="relative flex-1">
          <input
            value={item.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            onFocus={() => setShowSugg(true)}
            placeholder="문항명 입력 (예: 참여경로)"
            className={`w-full rounded-md border bg-background px-2.5 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 ${
              dup ? "border-red-500" : "border-border dark:border-gray-500"
            }`}
          />
          {showSugg && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-card shadow-md">
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSuggestion(s);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-secondary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        {!isAuto && (
          <button
            type="button"
            onClick={() => setShowChoices((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary dark:bg-gray-700 dark:border-gray-500 dark:text-gray-200"
          >
            선택지 편집
            {showChoices ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <DelBtn onClick={onRemove} />
      </div>
      {dup && (
        <div className="mt-1.5 pl-8 text-[11px] font-medium text-red-500">
          ⚠ 이미 사용된 항목입니다
        </div>
      )}
      {!isAuto && showChoices && (
        <div className="mt-3 space-y-1.5 rounded-md border border-dashed border-border bg-secondary/30 p-3 dark:border-gray-500">
          {(item.choices ?? []).map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">└</span>
              <input
                value={c}
                onChange={(e) => updateChoice(i, e.target.value)}
                placeholder="선택지 입력"
                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500"
              />
              <button
                type="button"
                onClick={() => removeChoice(i)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
                title="삭제"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addChoice}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> 선택지 추가
          </button>
        </div>
      )}
    </div>
  );
}

function ScaleRow({
  index,
  item,
  dup,
  onChange,
  onRemove,
}: {
  index: number;
  item: ScaleItem;
  dup: boolean;
  onChange: (next: ScaleItem) => void;
  onRemove: () => void;
}) {
  const updateItem = (i: number, v: string) => {
    const next = [...item.items];
    next[i] = v;
    onChange({ ...item, items: next });
  };
  const removeItem = (i: number) =>
    onChange({ ...item, items: item.items.filter((_, idx) => idx !== i) });
  const addItem = () => onChange({ ...item, items: [...item.items, ""] });

  return (
    <div className="rounded-lg border border-border bg-background p-2.5 dark:bg-gray-600 dark:border-gray-500">
      <div className="flex items-center gap-2">
        <RowIndex n={index} />
        <input
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          placeholder="척도 문항명 (예: 세부만족도)"
          className={`flex-1 rounded-md border bg-background px-2.5 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 ${
            dup ? "border-red-500" : "border-border dark:border-gray-500"
          }`}
        />
        <DelBtn onClick={onRemove} />
      </div>
      {dup && (
        <div className="mt-1.5 pl-8 text-[11px] font-medium text-red-500">
          ⚠ 이미 사용된 항목입니다
        </div>
      )}
      <div className="mt-3 space-y-1.5 rounded-md border border-dashed border-border bg-secondary/30 p-3 dark:border-gray-500">
        {item.items.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">└</span>
            <input
              value={c}
              onChange={(e) => updateItem(i, e.target.value)}
              placeholder="세부항목 (예: 강사 전문성)"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500"
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
              title="삭제"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> 세부항목 추가
        </button>
      </div>
    </div>
  );
}

function SubjRow({
  index,
  item,
  dup,
  onChange,
  onRemove,
}: {
  index: number;
  item: SubjItem;
  dup: boolean;
  onChange: (next: SubjItem) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5 dark:bg-gray-600 dark:border-gray-500">
      <div className="flex items-center gap-2">
        <RowIndex n={index} />
        <input
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          placeholder="주관식 문항명 (예: 소감 및 건의사항)"
          className={`flex-1 rounded-md border bg-background px-2.5 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 ${
            dup ? "border-red-500" : "border-border dark:border-gray-500"
          }`}
        />
        <DelBtn onClick={onRemove} />
      </div>
      {dup && (
        <div className="mt-1.5 pl-8 text-[11px] font-medium text-red-500">
          ⚠ 이미 사용된 항목입니다
        </div>
      )}
    </div>
  );
}

function StrengthRow({
  index,
  item,
  dup,
  onChange,
  onRemove,
}: {
  index: number;
  item: McItem;
  dup: boolean;
  onChange: (next: McItem) => void;
  onRemove: () => void;
}) {
  const choices = item.choices ?? [];
  const updateChoice = (i: number, v: string) => {
    const next = [...choices];
    next[i] = v;
    onChange({ ...item, choices: next });
  };
  const removeChoice = (i: number) =>
    onChange({ ...item, choices: choices.filter((_, idx) => idx !== i) });
  const addChoice = () => onChange({ ...item, choices: [...choices, ""] });

  return (
    <div className="rounded-lg border border-border bg-background p-2.5 dark:bg-gray-600 dark:border-gray-500">
      <div className="flex items-center gap-2">
        <RowIndex n={index} />
        <input
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          placeholder="강점 문항명 (예: 강점)"
          className={`flex-1 rounded-md border bg-background px-2.5 py-2 text-sm dark:bg-gray-700 dark:text-gray-100 ${
            dup ? "border-red-500" : "border-border dark:border-gray-500"
          }`}
        />
        <DelBtn onClick={onRemove} />
      </div>
      {dup && (
        <div className="mt-1.5 pl-8 text-[11px] font-medium text-red-500">
          ⚠ 이미 사용된 항목입니다
        </div>
      )}
      <div className="mt-3 space-y-1.5 rounded-md border border-dashed border-border bg-secondary/30 p-3 dark:border-gray-500">
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">└</span>
            <input
              value={c}
              onChange={(e) => updateChoice(i, e.target.value)}
              placeholder="세부항목 (예: 강사의 전문성)"
              className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500"
            />
            <button
              type="button"
              onClick={() => removeChoice(i)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-secondary"
              title="삭제"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addChoice}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> 세부항목 추가
        </button>
      </div>
    </div>
  );
}