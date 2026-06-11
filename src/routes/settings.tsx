import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  User as UserIcon,
  FileText,
  FileStack,
  Database,
  Bell,
  Trash2,
  Save,
  KeyRound,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { useSettings, settingsStore, type Department, type DownloadFormat } from "@/lib/settings-store";
import { surveySession, type SurveyStructure } from "@/lib/survey-session";
import { analysisHistory, useAnalysisHistory, formatHistoryDate, groupHistoryTemplates } from "@/lib/analysis-history";
import { DEPARTMENTS } from "@/lib/analysis-history";
import type { QuestionDef } from "@/lib/survey-session";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "설정 · SatisAI" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? (s.tab as TabKey) : undefined,
  }),
  component: SettingsPage,
});

type TabKey = "account" | "credentials" | "report" | "templates" | "data" | "notif";

const TABS: { key: TabKey; label: string; icon: typeof UserIcon }[] = [
  { key: "account", label: "내 계정", icon: UserIcon },
  { key: "credentials", label: "계정 관리", icon: KeyRound },
  { key: "report", label: "보고서 기본값", icon: FileText },
  { key: "templates", label: "설문 템플릿", icon: FileStack },
  { key: "data", label: "데이터 관리", icon: Database },
  { key: "notif", label: "알림 설정", icon: Bell },
];

function SettingsPage() {
  const search = Route.useSearch();
  const [tab, setTab] = useState<TabKey>(search.tab ?? "account");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="설정"
        description="계정·보고서·템플릿·데이터·알림 설정을 한 곳에서 관리합니다."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-1 rounded-2xl border border-border bg-card p-3 h-fit">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary-soft text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            );
          })}
        </aside>
        <section className="rounded-2xl border border-border bg-card p-6">
          {tab === "account" && <AccountSection />}
          {tab === "credentials" && <CredentialsSection />}
          {tab === "report" && <ReportSection />}
          {tab === "templates" && <TemplatesSection />}
          {tab === "data" && <DataSection />}
          {tab === "notif" && <NotifSection />}
        </section>
      </div>
    </AppShell>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

/* ---------------- 1. 내 계정 ---------------- */
function AccountSection() {
  const { currentUser, displayName } = useAuth();
  const settings = useSettings();
  const [name, setName] = useState(settings.userName || displayName);
  const dept: Department | "" = currentUser?.dept ?? settings.department ?? "";

  const save = () => {
    settingsStore.update({ userName: name.trim() });
    toast.success("저장되었습니다");
  };

  return (
    <div>
      <SectionHeader title="내 계정" desc="이름을 수정하면 사이드바에 즉시 반영됩니다. 소속 부서는 로그인 계정에 따라 자동 설정됩니다." />
      <div className="space-y-5 max-w-xl">
        <Field label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="소속 부서">
          <input
            value={dept}
            readOnly
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
          />
        </Field>
        <Field label="로그인 아이디">
          <input
            value={currentUser?.id ?? ""}
            readOnly
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
          />
        </Field>
        <SaveButton onClick={save} />
      </div>
    </div>
  );
}

/* ---------------- 1.5 계정 관리 ---------------- */
function CredentialsSection() {
  const { currentUser, changePassword } = useAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const submit = () => {
    const result = changePassword(currentPw, newPw, confirmPw);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("비밀번호가 변경되었습니다.");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  };

  return (
    <div>
      <SectionHeader title="계정 관리" desc="로그인 정보를 확인하고 비밀번호를 변경합니다." />
      <div className="max-w-xl space-y-5">
        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-2 text-sm font-semibold">현재 계정</div>
          <div className="space-y-1 text-sm">
            <div className="flex gap-3">
              <span className="w-20 text-muted-foreground">아이디</span>
              <span className="font-medium">{currentUser?.id ?? "—"}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-20 text-muted-foreground">소속 부서</span>
              <span className="font-medium">{currentUser?.dept ?? "—"}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="mb-3 text-sm font-semibold">비밀번호 변경</div>
          <div className="space-y-3">
            <Field label="현재 비밀번호">
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="새 비밀번호">
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </Field>
            <div>
              <button
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <KeyRound className="h-4 w-4" /> 비밀번호 변경
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 2. 보고서 기본값 ---------------- */
function ReportSection() {
  const settings = useSettings();
  const [orgName, setOrgName] = useState(settings.orgName);
  const [year, setYear] = useState(settings.reportYear);
  const [format, setFormat] = useState<DownloadFormat>(settings.downloadFormat);

  const save = () => {
    settingsStore.update({ orgName: orgName.trim() || "강남시니어플라자", reportYear: year, downloadFormat: format });
    toast.success("저장되었습니다");
  };

  return (
    <div>
      <SectionHeader title="보고서 기본값" desc="보고서 생성 시 자동으로 적용되는 기본 정보를 설정합니다." />
      <div className="space-y-5 max-w-xl">
        <Field label="기관명">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="보고서 연도">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="기본 다운로드 형식">
          <div className="flex gap-2">
            {(["hwp", "xlsx", "pdf"] as DownloadFormat[]).map((f) => {
              const active = format === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium uppercase transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-secondary"
                  }`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Field>
        <SaveButton onClick={save} />
      </div>
    </div>
  );
}

/* ---------------- 3. 설문 템플릿 ---------------- */
function TemplatesSection() {
  const settings = useSettings();
  const navigate = useNavigate();
  const currentDept = settings.department || "";
  const history = useAnalysisHistory(currentDept);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const historyTemplates = useMemo(() => groupHistoryTemplates(history), [history]);

  const loadSaved = (id: string) => {
    const t = settings.templates.find((x) => x.id === id);
    if (!t) return;
    surveySession.setStructure(t.structure as SurveyStructure, {
      scaleRowLabels: t.scaleRowLabels,
      strengthChoices: t.strengthChoices,
    });
    settingsStore.touchTemplate(id);
    toast.success(`'${t.name}' 템플릿을 불러왔습니다`);
    navigate({ to: "/structure" });
  };

  const loadHistory = (qs: QuestionDef[], name: string) => {
    try { sessionStorage.setItem("structureFrom", "templates"); } catch {}
    if (qs.length) {
      surveySession.loadFromTemplate(qs, name);
      toast.success(`'${name}' 구조를 불러왔습니다`);
      navigate({ to: "/structure" });
    } else {
      toast.error("문항 구조 정보가 없습니다. 해당 분석 데이터를 다시 업로드해 주세요.");
    }
  };

  return (
    <div>
      <SectionHeader
        title="설문 템플릿 관리"
        desc="자주 사용하는 설문 구조를 저장해두고 빠르게 불러올 수 있습니다."
      />
      {historyTemplates.length === 0 && settings.templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-10 text-center text-sm text-muted-foreground">
          분석 이력이 없습니다.
          <br />
          분석을 진행하면 사용한 설문 구조가 자동으로 등록됩니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {historyTemplates.map((t) => (
            <div key={t.sig} className="rounded-xl border border-border bg-background p-4">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t.questions.length > 0
                  ? `객관식 ${t.mc} · 척도 ${t.scale} · 주관식 ${t.subj}`
                  : "문항 구조 없음"}
              </div>
              {t.questions.length > 0 && (
                <div className="mt-1 inline-flex w-fit items-center rounded-md bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                  {t.preset === "A"
                    ? "구조 A · 표준"
                    : t.preset === "B"
                      ? "구조 B · 축약"
                      : "직접 선택 구조"}
                </div>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                마지막 사용: {formatHistoryDate(t.latest)} · 사용 {t.count}회
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => loadHistory(t.questions, t.name)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  불러오기
                </button>
              </div>
            </div>
          ))}
          {settings.templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-background p-4">
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                객관식 {t.counts.mc} · 척도 {t.counts.scale} · 주관식 {t.counts.subj}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                마지막 사용: {t.lastUsedAt ? formatDate(t.lastUsedAt) : "—"}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => loadSaved(t.id)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  불러오기
                </button>
                <button
                  onClick={() => setConfirmId(t.id)}
                  className="rounded-md border border-destructive/40 bg-background px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmId && (
        <ConfirmModal
          title="템플릿을 삭제하시겠습니까?"
          desc="삭제된 템플릿은 복구할 수 없습니다."
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            settingsStore.removeTemplate(confirmId);
            setConfirmId(null);
            toast.success("템플릿이 삭제되었습니다");
          }}
        />
      )}
    </div>
  );
}

/* ---------------- 4. 데이터 관리 ---------------- */
function DataSection() {
  const settings = useSettings();
  const navigate = useNavigate();
  const dept = settings.department || "";
  const history = useAnalysisHistory(dept);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rows = useMemo(
    () => [...history].sort((a, b) => (a.analyzedAt < b.analyzedAt ? 1 : -1)),
    [history],
  );

  return (
    <div>
      <SectionHeader
        title="데이터 관리"
        desc="업로드·분석된 설문 데이터를 확인하고 삭제할 수 있습니다."
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-10 text-center text-sm text-muted-foreground">
          업로드된 설문 데이터가 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">프로그램명</th>
                <th className="px-4 py-2.5 text-left font-medium">부서</th>
                <th className="px-4 py-2.5 text-left font-medium">응답 수</th>
                <th className="px-4 py-2.5 text-left font-medium">분석일</th>
                <th className="px-4 py-2.5 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">{r.programName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.dept || "—"}</td>
                  <td className="px-4 py-3">{r.responseCount}건</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatHistoryDate(r.analyzedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setConfirmId(r.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" /> 삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setConfirmAll(true)}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> 전체 데이터 삭제
        </button>
      </div>

      <div className="mt-4 flex flex-col items-end gap-2 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          모든 부서의 분석 이력을 한 번에 초기화합니다.
        </p>
        <button
          onClick={() => setConfirmResetAll(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/60 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> 분석 이력 전체 초기화
        </button>
      </div>

      {confirmId && (
        <ConfirmModal
          title="해당 분석 데이터를 삭제하시겠습니까?"
          desc="이 작업은 되돌릴 수 없습니다."
          onCancel={() => setConfirmId(null)}
          onConfirm={() => {
            if (dept) analysisHistory.remove(dept, confirmId);
            setConfirmId(null);
            toast.success("데이터가 삭제되었습니다");
          }}
        />
      )}
      {confirmAll && (
        <ConfirmModal
          title="정말 삭제하시겠습니까?"
          desc="모든 분석 데이터가 삭제됩니다."
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => {
            if (dept) analysisHistory.clear(dept);
            surveySession.clearResponses();
            setConfirmAll(false);
            toast.success("전체 데이터가 삭제되었습니다");
          }}
        />
      )}
      {confirmResetAll && (
        <ConfirmModal
          title="분석 이력을 전체 초기화할까요?"
          desc="저장된 분석 이력이 모두 삭제됩니다. 삭제 후에는 복구할 수 없습니다."
          confirmLabel="초기화하기"
          onCancel={() => setConfirmResetAll(false)}
          onConfirm={() => {
            // 모든 부서별 분석 이력 + 레거시 키 삭제
            for (const d of DEPARTMENTS) analysisHistory.clear(d);
            try {
              localStorage.removeItem("analysisHistory");
              for (const d of DEPARTMENTS) {
                localStorage.removeItem(`analysisHistory_${d}`);
              }
            } catch {}
            surveySession.clearResponses();
            setConfirmResetAll(false);
            toast.success("분석 이력이 초기화되었습니다. 새로 분석을 진행해 주세요.");
            navigate({ to: "/" });
          }}
        />
      )}
    </div>
  );
}

/* ---------------- 5. 알림 설정 ---------------- */
function NotifSection() {
  const settings = useSettings();
  const toggle = (key: keyof typeof settings.notif) => {
    settingsStore.update({ notif: { ...settings.notif, [key]: !settings.notif[key] } });
  };

  return (
    <div>
      <SectionHeader title="알림 설정" desc="필요한 알림만 받도록 항목별로 켜고 끌 수 있습니다." />
      <div className="space-y-3 max-w-2xl">
        <ToggleRow
          title="분석 완료 알림"
          desc="AI가 설문 분석을 완료했을 때 알림"
          on={settings.notif.analysisDone}
          onToggle={() => toggle("analysisDone")}
        />
        <ToggleRow
          title="검수 요청 알림"
          desc="데이터 검수가 필요한 항목 발생 시"
          on={settings.notif.reviewRequest}
          onToggle={() => toggle("reviewRequest")}
        />
        <ToggleRow
          title="보고서 생성 완료 알림"
          desc="보고서 파일 생성이 완료됐을 때"
          on={settings.notif.reportDone}
          onToggle={() => toggle("reportDone")}
        />
      </div>
    </div>
  );
}

/* ---------------- Shared ---------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-foreground">{label}</div>
      {children}
    </label>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Save className="h-4 w-4" /> 저장
    </button>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3.5">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          on ? "bg-primary" : "bg-secondary border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function ConfirmModal({
  title,
  desc,
  onConfirm,
  onCancel,
  confirmLabel,
}: {
  title: string;
  desc?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)]">
        <div className="text-base font-semibold">{title}</div>
        {desc && <p className="mt-2 text-sm text-muted-foreground">{desc}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-secondary"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:opacity-90"
          >
            {confirmLabel ?? "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}