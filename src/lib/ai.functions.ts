import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const QuestionDefSchema = z.discriminatedUnion("type", [
  z.object({ no: z.number(), type: z.literal("mc"), text: z.string(), choices: z.array(z.string()) }),
  z.object({ no: z.number(), type: z.literal("scale"), text: z.string(), rows: z.array(z.string()) }),
  z.object({ no: z.number(), type: z.literal("subj"), text: z.string() }),
]);
type QuestionDef = z.infer<typeof QuestionDefSchema>;

const ScanInput = z.object({
  payload: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("image"), dataUrl: z.string().min(20), mediaType: z.string() }),
    z.object({ kind: z.literal("pdf"), dataUrl: z.string().min(20) }),
    z.object({ kind: z.literal("excel"), text: z.string() }),
  ]),
  questions: z.array(QuestionDefSchema).min(1),
  surveyHint: z.string().optional(),
});

// ──────────────────────────────────────────────────────────────────────────
// Google Cloud Vision API (DOCUMENT_TEXT_DETECTION) 기반 OCR
//
// 비용 문제로 멀티모달 LLM(Vision) 호출을 제거하고, 무료 한도가 넉넉한
// Google Cloud Vision API 로 교체했습니다.
//
//   엔드포인트: https://vision.googleapis.com/v1/images:annotate
//   환경변수:   GOOGLE_CLOUD_API_KEY
//   (Vercel 배포 시 환경변수 등록 필요: GOOGLE_CLOUD_API_KEY = Google Cloud 발급 키)
//
// 흐름: 페이지 이미지(base64) → Vision OCR → fullTextAnnotation.text 추출
//       → questions 배열 기준 동적 매핑 → 기존과 동일한 응답 형태로 반환
// ──────────────────────────────────────────────────────────────────────────

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

type VisionResult = { text: string; confidence: number };

async function googleVisionOcr(base64Image: string): Promise<VisionResult> {
  const key = process.env.GOOGLE_CLOUD_API_KEY;
  if (!key) throw new Error("GOOGLE_CLOUD_API_KEY 가 설정되어 있지 않습니다");

  const response = await fetch(`${VISION_ENDPOINT}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }, { type: "TEXT_DETECTION" }],
          imageContext: { languageHints: ["ko", "en"] },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Vision API 오류 (${response.status}): ${body.slice(0, 300)}`);
  }

  const json: any = await response.json();
  const r = json?.responses?.[0];
  if (r?.error?.message) throw new Error(`Google Vision API 오류: ${r.error.message}`);

  const fta = r?.fullTextAnnotation;
  const text: string = fta?.text ?? r?.textAnnotations?.[0]?.description ?? "";

  // confidence: 페이지 단위 confidence 평균 → 없으면 블록 평균 → 기본값
  let confidence = 0;
  const pages: any[] = fta?.pages ?? [];
  const pageConfs = pages.map((p) => p?.confidence).filter((c) => typeof c === "number");
  if (pageConfs.length) {
    confidence = pageConfs.reduce((s, c) => s + c, 0) / pageConfs.length;
  } else {
    const blockConfs: number[] = [];
    for (const p of pages) for (const b of p?.blocks ?? []) {
      if (typeof b?.confidence === "number") blockConfs.push(b.confidence);
    }
    if (blockConfs.length) confidence = blockConfs.reduce((s, c) => s + c, 0) / blockConfs.length;
    else if (text) confidence = 0.9;
  }

  return { text, confidence: Math.max(0, Math.min(1, confidence)) };
}

// ── OCR 전체 텍스트 → questions 배열 기준 동적 매핑 ──────────────────────────

const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// 동그라미/체크 등 "선택 표시"로 흔히 인식되는 글리프
const MARK_RE = /[○◯●◦✓✔√ⓞ@*]|[①②③④⑤⑥⑦⑧⑨⑩]/;
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// 문항 텍스트가 등장하는 라인 인덱스 추정 (부분 일치)
function findQuestionLine(lines: string[], questionText: string): number {
  const key = normalize(questionText).slice(0, 12);
  if (!key) return -1;
  for (let i = 0; i < lines.length; i++) {
    if (normalize(lines[i]).includes(key)) return i;
  }
  return -1;
}

// 객관식: 표시(동그라미/번호)가 붙은 보기를 추정. 불확실하면 null.
function detectChoice(choices: string[], lines: string[], qLine: number): number | null {
  const window = qLine >= 0 ? lines.slice(qLine, qLine + 4).join(" ") : lines.join(" ");
  // 1) 원문자(①②③) 표기로 선택 추정
  for (let i = 0; i < choices.length && i < CIRCLED.length; i++) {
    if (window.includes(CIRCLED[i])) return i;
  }
  // 2) 보기 라벨 + 인접 마크
  for (let i = 0; i < choices.length; i++) {
    const label = normalize(choices[i]);
    if (!label) continue;
    const hit = lines.find((l) => normalize(l).includes(label) && MARK_RE.test(l));
    if (hit) return i;
  }
  return null;
}

// 5점 척도: 평가행 라인에서 점수 추정. 불확실하면 null.
function detectScaleScore(row: string, lines: string[]): number | null {
  const key = normalize(row).slice(0, 8);
  if (!key) return null;
  const line = lines.find((l) => normalize(l).includes(key));
  if (!line) return null;
  for (let i = 0; i < 5; i++) if (line.includes(CIRCLED[i])) return i + 1;
  const m = line.match(/[1-5]/);
  if (m && MARK_RE.test(line)) return Number(m[0]);
  return null;
}

// 주관식: 문항 라인 다음부터 다음 문항 전까지의 텍스트를 응답으로 추출
function extractSubjective(q: QuestionDef, questions: QuestionDef[], lines: string[]): string {
  const qLine = findQuestionLine(lines, q.text);
  if (qLine < 0) return "";
  let end = lines.length;
  for (const other of questions) {
    if (other.no <= q.no) continue;
    const ol = findQuestionLine(lines, other.text);
    if (ol > qLine && ol < end) end = ol;
  }
  const body = lines.slice(qLine + 1, end).join(" ").trim();
  return body.replace(new RegExp(q.text.slice(0, 8).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").trim();
}

function mapTextToQuestions(
  text: string,
  questions: QuestionDef[],
  confidence: number,
): { responses: { answers: Record<number, any> }[] } {
  const lines = splitLines(text);
  const answers: Record<number, any> = {};
  for (const q of questions) {
    if (q.type === "mc") {
      const qLine = findQuestionLine(lines, q.text);
      const choiceIndex = detectChoice(q.choices, lines, qLine);
      answers[q.no] = {
        type: "mc",
        choiceIndex,
        confidence: choiceIndex == null ? Math.min(confidence, 0.4) : confidence,
      };
    } else if (q.type === "scale") {
      const scores: Record<string, number | null> = {};
      for (const row of q.rows) scores[row] = detectScaleScore(row, lines);
      answers[q.no] = { type: "scale", scores, confidence };
    } else {
      const t = extractSubjective(q, questions, lines);
      answers[q.no] = { type: "subj", text: t, confidence: t ? confidence : Math.min(confidence, 0.4) };
    }
  }
  return { responses: [{ answers }] };
}

export const scanSurvey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data }) => {
    // ── 엑셀: 표 데이터는 기존 방식(LLM 매핑) 그대로 유지 ──
    if (data.payload.kind === "excel") {
      const key = process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("LOVABLE_API_KEY 가 설정되어 있지 않습니다");
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-3-flash-preview");

      const schemaSpec = data.questions
        .map((q) => {
          if (q.type === "mc")
            return `Q${q.no} (객관식): "${q.text}" 보기 → ${q.choices.map((c, i) => `${i}:${c}`).join(", ")}`;
          if (q.type === "scale")
            return `Q${q.no} (5점척도 표): "${q.text}" 평가행 → ${q.rows.join(", ")}`;
          return `Q${q.no} (주관식): "${q.text}"`;
        })
        .join("\n");

      const prompt = `당신은 한국 노인복지관 만족도 설문지를 정확히 매칭·인식하는 AI입니다.
아래 설문 구조에 맞춰 응답을 추출해 JSON으로만 답하세요.

[설문 구조]
${schemaSpec}

엑셀 데이터에는 여러 명의 응답이 포함될 수 있습니다. 각 행을 하나의 응답으로 처리하세요.

[출력 형식 — 반드시 이 JSON만 출력]
{
  "responses": [
    {
      "answers": {
        "1": {"type":"mc","choiceIndex":0,"confidence":0.95},
        "2": {"type":"scale","scores":{"주제/내용":5,"강사 전문성":4},"confidence":0.9},
        "3": {"type":"subj","text":"좋았어요","confidence":0.85}
      }
    }
  ]
}
규칙:
- choiceIndex 는 보기 배열의 0-based 인덱스, 인식 실패 시 null.
- scale 의 scores 키는 평가행 이름과 동일, 값은 1~5 정수 또는 null.
- subj 는 인식한 텍스트(없으면 빈 문자열).
- confidence 는 0.0~1.0.
- JSON 이외의 텍스트, 마크다운, 코드펜스 금지.
힌트: ${data.surveyHint ?? "노인복지관 만족도 조사"}
[엑셀 표 데이터]
${data.payload.text.slice(0, 12000)}`;

      const { text } = await generateText({
        model,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      });
      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        return { ok: true as const, result: JSON.parse(cleaned) };
      } catch {
        return { ok: false as const, raw: text };
      }
    }

    // ── 이미지 / PDF 페이지: Google Cloud Vision OCR ──
    if (data.payload.kind === "image") {
      try {
        const { text, confidence } = await googleVisionOcr(stripDataUrl(data.payload.dataUrl));
        if (!text.trim()) return { ok: false as const, raw: "Vision OCR 결과가 비어 있습니다" };
        const result = mapTextToQuestions(text, data.questions, confidence);
        return { ok: true as const, result };
      } catch (e: any) {
        return { ok: false as const, raw: e?.message ?? "Vision OCR 실패" };
      }
    }

    // PDF 원본은 업로드 단계에서 페이지 이미지로 변환되어 image 로 전달됩니다.
    return { ok: false as const, raw: "PDF 는 페이지 이미지로 변환 후 처리됩니다" };
  });

const ReportInput = z.object({
  surveyName: z.string(),
  department: z.string(),
  totalResponses: z.number(),
  avgScore: z.number(),
  highlights: z.array(z.string()).default([]),
  freeTextSamples: z.array(z.string()).default([]),
});

export const draftReport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ReportInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY 가 설정되어 있지 않습니다");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const { text } = await generateText({
      model,
      system: "당신은 한국 노인복지관의 정중하고 명료한 행정 보고서를 작성하는 전문가입니다. 공공기관 문체로 작성합니다.",
      prompt: `다음 만족도 조사 데이터로 보고서 초안을 작성해주세요.
- 사업명: ${data.surveyName}
- 담당 부서: ${data.department}
- 총 응답 수: ${data.totalResponses}건
- 종합 평균: ${data.avgScore} / 5.0
- 주요 지표: ${data.highlights.join(", ") || "-"}
- 주관식 응답 샘플: ${data.freeTextSamples.join(" / ") || "-"}

다음 섹션을 마크다운으로 작성: 1) 조사 개요  2) 응답자 특성 요약  3) 핵심 결과  4) 시사점  5) 개선 제언.`,
    });

    return { markdown: text };
  });
