import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { AppShell, PageHeader } from "@/components/AppShell";
import { scanSurvey } from "@/lib/ai.functions";
import { surveySession, useSurveySession, type SurveyResponse } from "@/lib/survey-session";
import { UploadCloud, Loader2, FileCheck2, AlertCircle, FileSpreadsheet, FileText, Image as ImageIcon, ArrowRight, ListChecks, RotateCcw, FolderOpen, Camera, Images, X, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "AI 스캔 업로드 · SatisAI" },
      { name: "description", content: "엑셀 설문지를 업로드하면 AI가 자동으로 응답을 인식·매칭합니다." },
    ],
  }),
  component: UploadPage,
});

type Pending = {
  file: File;
  kind: "image" | "pdf" | "excel";
  preview?: string;
  status: "queued" | "scanning" | "done" | "error";
  message?: string;
};

const detectKind = (f: File): Pending["kind"] | null => {
  const n = f.name.toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "excel";
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp") || n.endsWith(".heic")) return "image";
  if (f.type.startsWith("image/")) return "image";
  if (f.type === "application/pdf") return "pdf";
  return null;
};

const readAsDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

const readAsArrayBuffer = (f: File) =>
  new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(f);
  });

// PDF 페이지 → 이미지 dataURL 배열로 분리 (브라우저에서만 동작)
// Google Cloud Vision API 는 페이지별 이미지(base64)를 입력으로 받으므로
// 업로드된 PDF 를 페이지 단위 이미지로 변환한다.
let pdfjsCache: any | null = null;
async function loadPdfjs(): Promise<any> {
  if (pdfjsCache) return pdfjsCache;
  const pdfjs: any = await import("pdfjs-dist");
  // 워커 설정 — 번들된 워커를 우선 사용하고, 실패하면 동일 버전 CDN 으로 폴백한다.
  try {
    const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  } catch {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    } catch {
      /* 워커 미설정 시 pdfjs 가 메인 스레드로 폴백 */
    }
  }
  pdfjsCache = pdfjs;
  return pdfjs;
}

async function splitPdfToImages(file: File): Promise<{ pageNum: number; dataUrl: string; label: string }[]> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out: { pageNum: number; dataUrl: string; label: string }[] = [];
  // 너무 큰 캔버스는 toDataURL 이 실패하므로 한 변을 2200px 로 제한한다.
  const MAX_DIM = 2200;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, MAX_DIM / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 생성할 수 없습니다");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push({
      pageNum: i,
      dataUrl: canvas.toDataURL("image/jpeg", 0.9),
      label: `${file.name} — ${i}페이지`,
    });
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup?.();
  }
  return out;
}

function UploadPage() {
  const scan = useServerFn(scanSurvey);
  const session = useSurveySession();
  const navigate = useNavigate();
  const [items, setItems] = useState<Pending[]>([]);
  const [running, setRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    active: boolean;
    total: number;
    done: number;
    pages: { label: string; status: "queued" | "doing" | "done" | "error"; message?: string }[];
  }>({ active: false, total: 0, done: 0, pages: [] });
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const onPick = async (files: FileList | null) => {
    if (!files) return;
    const next: Pending[] = [];
    for (const f of Array.from(files)) {
      const kind = detectKind(f);
      if (!kind) continue;
      const p: Pending = { file: f, kind, status: "queued" };
      if (kind === "image") p.preview = await readAsDataUrl(f);
      next.push(p);
    }
    setItems((prev) => [...prev, ...next]);
    setGlobalError(null);
  };

  const runAll = async () => {
    if (!session.structure) {
      setGlobalError("먼저 ‘설문 구조 선택’ 단계를 완료해주세요.");
      return;
    }
    setRunning(true);
    setGlobalError(null);
    cancelRef.current = false;

    // 1) 작업 단위(unit) 평탄화 — PDF 는 페이지별로 분리, 엑셀/이미지는 그대로
    type Unit =
      | { kind: "image"; label: string; source: string; dataUrl: string; mediaType: string; itemIdx: number }
      | { kind: "pdf-page"; label: string; source: string; dataUrl: string; itemIdx: number }
      | { kind: "excel"; label: string; source: string; text: string; itemIdx: number };
    const queue = items.map((i) => ({ ...i }));
    const units: Unit[] = [];

    for (let i = 0; i < queue.length; i++) {
      const it = queue[i];
      if (it.status === "done") continue;
      try {
        if (it.kind === "image") {
          units.push({
            kind: "image",
            label: it.file.name,
            source: it.file.name,
            dataUrl: it.preview ?? (await readAsDataUrl(it.file)),
            mediaType: it.file.type || "image/png",
            itemIdx: i,
          });
        } else if (it.kind === "pdf") {
          it.status = "scanning";
          it.message = "PDF 페이지 분리 중...";
          setItems([...queue]);
          const pages = await splitPdfToImages(it.file);
          for (const p of pages) {
            units.push({
              kind: "pdf-page",
              label: p.label,
              source: p.label,
              dataUrl: p.dataUrl,
              itemIdx: i,
            });
          }
        } else {
          const buf = await readAsArrayBuffer(it.file);
          const wb = XLSX.read(buf, { type: "array" });
          const sheets = wb.SheetNames.map((n) => {
            const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n]);
            return `# Sheet: ${n}\n${csv}`;
          }).join("\n\n");
          units.push({ kind: "excel", label: it.file.name, source: it.file.name, text: sheets, itemIdx: i });
        }
      } catch (e: any) {
        it.status = "error";
        it.message = e?.message ?? "분리 실패";
        setItems([...queue]);
      }
    }

    setProgress({
      active: true,
      total: units.length,
      done: 0,
      pages: units.map((u) => ({ label: u.label, status: "queued" })),
    });

    let counted: Record<number, number> = {};
    // 2) 순차 처리
    for (let i = 0; i < units.length; i++) {
      if (cancelRef.current) break;
      const u = units[i];
      setProgress((p) => {
        const pages = [...p.pages];
        pages[i] = { ...pages[i], status: "doing" };
        return { ...p, pages };
      });
      try {
        let payload: any;
        if (u.kind === "image") {
          payload = { kind: "image", dataUrl: u.dataUrl, mediaType: u.mediaType };
        } else if (u.kind === "pdf-page") {
          payload = { kind: "image", dataUrl: u.dataUrl, mediaType: "image/jpeg" };
        } else {
          payload = { kind: "excel", text: u.text };
        }
        const r = await scan({
          data: {
            payload,
            questions: session.questions,
            surveyHint: `${session.surveyName} · ${session.department}`,
          },
        });
        if (r.ok && r.result?.responses?.length) {
          for (const resp of r.result.responses) {
            // 엑셀은 신뢰도 1.0 강제
            const answers = resp.answers ?? {};
            if (u.kind === "excel") {
              for (const k of Object.keys(answers)) {
                if (answers[k]) answers[k] = { ...answers[k], confidence: 1 };
              }
            }
            surveySession.addResponse({
              id: crypto.randomUUID(),
              source: u.source,
              uploadedAt: Date.now(),
              answers,
            });
          }
          counted[u.itemIdx] = (counted[u.itemIdx] ?? 0) + r.result.responses.length;
          setProgress((p) => {
            const pages = [...p.pages];
            pages[i] = { ...pages[i], status: "done" };
            return { ...p, pages, done: p.done + 1 };
          });
        } else {
          setProgress((p) => {
            const pages = [...p.pages];
            pages[i] = { ...pages[i], status: "error", message: "인식 실패" };
            return { ...p, pages, done: p.done + 1 };
          });
        }
      } catch (e: any) {
        setProgress((p) => {
          const pages = [...p.pages];
          pages[i] = { ...pages[i], status: "error", message: e?.message ?? "오류" };
          return { ...p, pages, done: p.done + 1 };
        });
      }
    }

    // 3) 파일별 결과 마킹
    for (let i = 0; i < queue.length; i++) {
      const n = counted[i] ?? 0;
      if (n > 0) {
        queue[i].status = "done";
        queue[i].message = `${n}건 인식 완료`;
      } else if (queue[i].status !== "error") {
        queue[i].status = "error";
        queue[i].message = cancelRef.current ? "사용자 취소" : "AI 응답 파싱 실패";
      }
    }
    setItems([...queue]);
    setProgress((p) => ({ ...p, active: false }));
    setRunning(false);
  };

  const KindIcon = ({ k }: { k: Pending["kind"] }) =>
    k === "image" ? <ImageIcon className="h-4 w-4" /> : k === "pdf" ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Step 1"
        title="AI 스캔 업로드"
        description="엑셀(.xlsx/.xls/.csv) 형식의 설문지를 업로드할 수 있습니다."
        actions={
          <button
            onClick={() => {
              if (!confirm("업로드 목록과 이번 세션의 인식 결과를 모두 초기화할까요?")) return;
              setItems([]);
              setGlobalError(null);
              surveySession.clearResponses();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4" /> 초기화
          </button>
        }
      />

      {!session.structure ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-muted-foreground" />
          <div className="mt-3 text-sm font-medium">설문 구조가 아직 선택되지 않았어요</div>
          <p className="mt-1 text-xs text-muted-foreground">정확한 응답 매칭을 위해 먼저 구조를 지정해야 합니다.</p>
          <Link
            to="/structure"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            구조 선택하러 가기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-primary-soft/30 px-4 py-3 text-xs">
            <div className="text-accent-foreground">
              선택된 구조 <b>{session.structure.label}</b> · 총 {session.questions.length} 문항 ·{" "}
              {session.surveyName} / {session.department}
            </div>
            <Link to="/structure" className="text-primary hover:underline">
              구조 변경
            </Link>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-accent-foreground">
              <UploadCloud className="h-7 w-7" />
            </div>
            <div>
              <div className="text-sm font-medium">엑셀 · PDF · 사진 파일을 업로드하세요</div>
              <div className="mt-1 text-xs text-muted-foreground">
                (xlsx / xls / pdf / jpg / png) · 여러 파일 동시 업로드 가능
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                <FolderOpen className="h-4 w-4" /> 파일 선택
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                <Camera className="h-4 w-4" /> 카메라 촬영
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary"
              >
                <Images className="h-4 w-4" /> 갤러리에서 선택
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              💡 카메라 촬영은 모바일·태블릿에서 동작합니다. PC에서는 [파일 선택]을 이용하세요.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {globalError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" /> {globalError}
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-6 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  {it.kind === "image" && it.preview ? (
                    <img src={it.preview} alt={it.file.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary text-foreground">
                      <KindIcon k={it.kind} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{it.file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.kind.toUpperCase()} · {(it.file.size / 1024).toFixed(0)} KB ·{" "}
                      {it.kind === "excel"
                        ? "데이터를 자동으로 파싱합니다"
                        : "AI가 응답 내용을 자동으로 인식합니다"}
                      {it.message && ` · ${it.message}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {it.status === "queued" && <span className="text-muted-foreground">대기</span>}
                    {it.status === "scanning" && (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 분석 중
                      </span>
                    )}
                    {it.status === "done" && <span className="text-success">완료</span>}
                    {it.status === "error" && <span className="text-destructive">오류</span>}
                    {!running && it.status !== "scanning" && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label="제거"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"
                >
                  <Camera className="h-3.5 w-3.5" /> 추가 촬영
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setItems([])}
                  className="rounded-lg border border-border px-4 py-2 text-sm"
                >
                  목록 비우기
                </button>
                {session.responses.length === 0 ? (
                  <button
                    onClick={runAll}
                    disabled={running}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] disabled:opacity-40"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
                    {running ? "AI 분석 중..." : "AI 일괄 분석 시작"}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate({ to: "/review" })}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)]"
                  >
                    검수로 이동 ({session.responses.length}건) <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {progress.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">AI 응답 인식 중...</div>
              <button
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"
              >
                <X className="h-3 w-3" /> 취소
              </button>
            </div>
            <div className="mb-1 text-xs text-muted-foreground">
              {progress.done} / {progress.total} 페이지
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-xs">
              {progress.pages.map((pg, i) => (
                <div key={i} className="flex items-center gap-2">
                  {pg.status === "done" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  ) : pg.status === "doing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : pg.status === "error" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-border" />
                  )}
                  <span className="truncate">{pg.label}</span>
                  <span className="ml-auto text-muted-foreground">
                    {pg.status === "done" ? "완료" : pg.status === "doing" ? "처리 중" : pg.status === "error" ? (pg.message ?? "오류") : "대기"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}