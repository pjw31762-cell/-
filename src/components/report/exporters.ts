/* 보고서 다운로드 — DOCX & HTML. 화면에 렌더링된 [data-report-root] 노드를
   그대로 직렬화한다. 편집된 텍스트(contentEditable) 가 그대로 반영된다. */

import {
  Document, Packer, Paragraph, HeadingLevel, TextRun,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
  ImageRun,
} from "docx";

const safe = (s: string) =>
  s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_").slice(0, 80) || "보고서";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* 차트 SVG → PNG dataURL 로 변환. 분석 화면과 동일한 방식. */
async function svgToPng(svg: SVGSVGElement, scale = 2):
  Promise<{ dataUrl: string; width: number; height: number }> {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width || svg.clientWidth || 480));
  const h = Math.max(1, Math.round(rect.height || svg.clientHeight || 240));
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  cloned.setAttribute("width", String(w));
  cloned.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(cloned);
  const svg64 = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = (e) => rej(e);
    img.src = svg64;
  });
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h };
}

export async function exportHtml(opts: { reportYear: string; surveyName: string }) {
  const root = document.querySelector("[data-report-root]") as HTMLElement | null;
  if (!root) return;
  const clone = root.cloneNode(true) as HTMLElement;
  // contentEditable 텍스트는 원본 노드에 그대로 들어있으므로 clone 도 동일
  // 차트는 원본 svg 기준으로 PNG 변환한 결과를 clone 에 주입
  const cloneCharts = clone.querySelectorAll<HTMLElement>("[data-chart-id]");
  const origCharts = root.querySelectorAll<HTMLElement>("[data-chart-id]");
  for (let i = 0; i < cloneCharts.length; i++) {
    const origSvg = origCharts[i]?.querySelector("svg") as SVGSVGElement | null;
    if (!origSvg) continue;
    try {
      const { dataUrl, width, height } = await svgToPng(origSvg);
      const img = document.createElement("img");
      img.src = dataUrl;
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.width = width; img.height = height;
      cloneCharts[i].replaceChildren(img);
    } catch { /* skip */ }
  }
  // contentEditable 속성 제거
  clone.querySelectorAll("[contenteditable]").forEach((el) => {
    (el as HTMLElement).removeAttribute("contenteditable");
  });
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${opts.reportYear} ${opts.surveyName} 만족도분석보고서</title>
<style>
  body{font-family:"맑은 고딕","Malgun Gothic",sans-serif;max-width:840px;margin:40px auto;padding:0 24px;color:#111;line-height:1.6;font-size:14px;}
  h1,h2,h3,h4{color:#111;}
  h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:32px;}
  table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px;}
  th,td{border:1px solid #999;padding:6px 8px;}
  th{background:#f1f4f9;text-align:center;}
  ul{padding-left:20px;}
  .border-l-2{border-left:2px solid #4f6bef;padding-left:12px;margin:12px 0;}
</style></head><body>${clone.innerHTML}</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  download(blob, `${opts.reportYear}_${safe(opts.surveyName)}_만족도분석보고서.html`);
}

/* DOCX — DOM 을 순회하여 문단/표 단위로 변환한다.
   복잡한 스타일은 무시하고 텍스트와 표 구조만 보존한다. */
export async function exportDocx(opts: { reportYear: string; surveyName: string }) {
  const root = document.querySelector("[data-report-root]") as HTMLElement | null;
  if (!root) return;

  // 1) 모든 차트를 미리 PNG 로 캡처
  const chartMap = new Map<string, { dataUrl: string; width: number; height: number }>();
  const chartNodes = root.querySelectorAll<HTMLElement>("[data-chart-id]");
  for (const node of Array.from(chartNodes)) {
    const id = node.getAttribute("data-chart-id");
    if (!id) continue;
    const svg = node.querySelector("svg") as SVGSVGElement | null;
    if (!svg) continue;
    try {
      chartMap.set(id, await svgToPng(svg));
    } catch { /* skip */ }
  }

  const children: (Paragraph | Table)[] = [];

  const para = (text: string, opts?: { bold?: boolean; size?: number; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }) =>
    new Paragraph({
      heading: opts?.heading,
      alignment: opts?.align,
      children: [new TextRun({ text, bold: opts?.bold, size: opts?.size })],
    });

  const tableFromEl = (tbl: HTMLTableElement): Table => {
    const rows: TableRow[] = [];
    tbl.querySelectorAll("tr").forEach((tr) => {
      const cells: TableCell[] = [];
      tr.querySelectorAll("th,td").forEach((c) => {
        cells.push(
          new TableCell({
            width: { size: 100 / (tr.children.length || 1), type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: (c.textContent ?? "").trim(), bold: c.tagName === "TH" })] })],
          }),
        );
      });
      rows.push(new TableRow({ children: cells }));
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
      },
    });
  };

  const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
    const b64 = dataUrl.split(",")[1] ?? "";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  };

  const walk = (node: Element) => {
    const tag = node.tagName;
    // 차트 영역 — 캡처된 PNG 를 ImageRun 으로 삽입
    if (node.hasAttribute("data-chart-id")) {
      const id = node.getAttribute("data-chart-id")!;
      const cap = chartMap.get(id);
      if (cap) {
        const maxW = 480;
        const ratio = cap.height / cap.width;
        const w = Math.min(maxW, cap.width);
        const h = Math.round(w * ratio);
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            type: "png",
            data: dataUrlToUint8(cap.dataUrl),
            transformation: { width: w, height: h },
          } as any)],
        }));
      }
      return;
    }
    if (tag === "TABLE") {
      children.push(tableFromEl(node as HTMLTableElement));
      children.push(para(""));
      return;
    }
    if (tag === "UL" || tag === "OL") {
      node.querySelectorAll(":scope > li").forEach((li) => {
        children.push(para("• " + (li.textContent ?? "").trim()));
      });
      return;
    }
    if (tag === "H1") {
      children.push(para((node.textContent ?? "").trim(), { heading: HeadingLevel.HEADING_1, bold: true, align: AlignmentType.CENTER }));
      return;
    }
    if (tag === "H2") {
      children.push(para((node.textContent ?? "").trim(), { heading: HeadingLevel.HEADING_2, bold: true }));
      return;
    }
    if (tag === "H3" || tag === "H4") {
      children.push(para((node.textContent ?? "").trim(), { bold: true }));
      return;
    }
    // 편집 가능한 텍스트 블록 ([data-report-block]) — 줄바꿈을 보존
    if (node.hasAttribute("data-report-block") || tag === "P") {
      const text = (node.textContent ?? "").trim();
      if (text) {
        for (const line of text.split(/\n/)) children.push(para(line));
      }
      return;
    }
    // div 등 컨테이너 — 하위 노드 순회
    for (const child of Array.from(node.children)) walk(child);
  };

  // 헤더 블록 (제목)
  const titleEl = root.querySelector('[data-report-block="title.main"]');
  const subEl = root.querySelector('[data-report-block="title.sub"]');
  if (titleEl) children.push(para((titleEl.textContent ?? "").trim(), { heading: HeadingLevel.HEADING_1, bold: true, align: AlignmentType.CENTER }));
  if (subEl) children.push(para((subEl.textContent ?? "").trim(), { align: AlignmentType.CENTER }));
  children.push(para(""));

  for (const section of Array.from(root.querySelectorAll(":scope > section"))) {
    for (const child of Array.from(section.children)) walk(child);
    children.push(para(""));
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  download(blob, `${opts.reportYear}_${safe(opts.surveyName)}_만족도분석보고서.docx`);
}