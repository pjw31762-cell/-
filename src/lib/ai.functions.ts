import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const QuestionDefSchema = z.discriminatedUnion("type", [
  z.object({ no: z.number(), type: z.literal("mc"), text: z.string(), choices: z.array(z.string()) }),
  z.object({ no: z.number(), type: z.literal("scale"), text: z.string(), rows: z.array(z.string()) }),
  z.object({ no: z.number(), type: z.literal("subj"), text: z.string() }),
]);

const ScanInput = z.object({
  payload: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("image"), dataUrl: z.string().min(20), mediaType: z.string() }),
    z.object({ kind: z.literal("pdf"), dataUrl: z.string().min(20) }),
    z.object({ kind: z.literal("excel"), text: z.string() }),
  ]),
  questions: z.array(QuestionDefSchema).min(1),
  surveyHint: z.string().optional(),
});

export const scanSurvey = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ScanInput.parse(d))
  .handler(async ({ data }) => {
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

    const isExcel = data.payload.kind === "excel";
    const responseHint = isExcel
      ? "엑셀 데이터에는 여러 명의 응답이 포함될 수 있습니다. 각 행을 하나의 응답으로 처리하세요."
      : "한 명의 응답자가 작성한 설문지 한 부입니다.";

    const prompt = `당신은 한국 노인복지관 만족도 설문지를 정확히 매칭·인식하는 AI입니다.
아래 설문 구조에 맞춰 응답을 추출해 JSON으로만 답하세요.

[설문 구조]
${schemaSpec}

${responseHint}

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
- subj 는 인식한 손글씨/입력 텍스트(없으면 빈 문자열).
- confidence 는 0.0~1.0.
- JSON 이외의 텍스트, 마크다운, 코드펜스 금지.
힌트: ${data.surveyHint ?? "노인복지관 만족도 조사"}`;

    const content: any[] = [{ type: "text", text: prompt }];
    if (data.payload.kind === "image") {
      content.push({ type: "image", image: data.payload.dataUrl });
    } else if (data.payload.kind === "pdf") {
      content.push({
        type: "file",
        data: data.payload.dataUrl,
        mediaType: "application/pdf",
      });
    } else {
      content.push({ type: "text", text: `\n[엑셀 표 데이터]\n${data.payload.text.slice(0, 12000)}` });
    }

    const { text } = await generateText({
      model,
      messages: [{ role: "user", content }],
    });

    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return { ok: true as const, result: parsed };
    } catch {
      return { ok: false as const, raw: text };
    }
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