import { existsSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { HistoryTask } from "./summaries.js";

export type HistoryExportDay = {
  date: string;
  hours: number;
  login: string;
  logout: string;
  done: number;
  total: number;
  tasks: HistoryTask[];
};

export type ExportFile = {
  name: string;
  mimeType: string;
  base64: string;
};

export const REPORT_TOPICS = ["days", "hours", "tasks", "attendance"] as const;
export type ReportTopic = (typeof REPORT_TOPICS)[number];

type ReportChart = "hours" | "tasks";
type ReportTable = "attendance" | "tasks";

export type ReportPlan = {
  full: boolean;
  topics: ReportTopic[];
  title: string;
  subtitle: string;
  fileSlug: string;
  kpis: Array<[string, string]>;
  charts: ReportChart[];
  tables: ReportTable[];
};

const BRAND = "#EE1C29";
const GOLD = "#F5C16C";
const INK = "#1A1A1A";
const MUTED = "#5C5C5C";
const SILVER = "#A7A9AC";
const LINE = "#D4D4D4";
const PAPER = "#F7F7F7";
const HEADER_HEIGHT = 80;
const CONTENT_TOP = 96;
const PAGE_CONTENT_BOTTOM = 728;
const FOOTER_Y = 768;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

type ReportStats = {
  employeeName: string;
  period: string;
  firstDate: string;
  lastDate: string;
  generated: string;
  daysWorked: number;
  totalHours: number;
  tasksDone: number;
  tasksTotal: number;
  completion: number;
  chronological: HistoryExportDay[];
};

function reportStats(employeeName: string, days: HistoryExportDay[]): ReportStats {
  const chronological = [...days].reverse();
  const totalHours = days.reduce((sum, day) => sum + day.hours, 0);
  const tasksDone = days.reduce((sum, day) => sum + day.done, 0);
  const tasksTotal = days.reduce((sum, day) => sum + day.total, 0);
  const dates = days.map((day) => day.date).filter(Boolean).sort();
  const first = dates[0] ?? "—";
  const last = dates.at(-1) ?? "—";
  return {
    employeeName,
    period: first === last ? first : `${first}  to  ${last}`,
    firstDate: first,
    lastDate: last,
    generated: formatGeneratedAt(),
    daysWorked: days.length,
    totalHours,
    tasksDone,
    tasksTotal,
    completion: tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0,
    chronological,
  };
}

function createReportPlan(topics: ReportTopic[] | undefined, stats: ReportStats): ReportPlan {
  const unique = [...new Set(topics ?? [])].filter((topic): topic is ReportTopic =>
    REPORT_TOPICS.includes(topic)
  );
  const full = unique.length === 0;
  const selected = full ? [...REPORT_TOPICS] : unique;
  const has = (topic: ReportTopic) => selected.includes(topic);
  const titles: Record<ReportTopic, string> = {
    days: "Days worked",
    hours: "Hours report",
    tasks: "Task report",
    attendance: "Daily attendance",
  };
  const slugs: Record<ReportTopic, string> = {
    days: "Days-Worked",
    hours: "Hours-Report",
    tasks: "Task-Report",
    attendance: "Daily-Attendance",
  };
  const title = full || selected.length > 1 ? "Attendance report" : titles[selected[0] ?? "days"];
  const fileSlug = full || selected.length > 1 ? "Attendance-Report" : slugs[selected[0] ?? "days"];
  const kpis: Array<[string, string]> = [["Working days", String(stats.daysWorked)]];
  if (full || has("hours") || has("days") || has("attendance")) {
    kpis.push(["Total hours", stats.totalHours.toFixed(1)]);
  }
  if (full || has("tasks")) {
    kpis.push(["Tasks done", `${stats.tasksDone}/${stats.tasksTotal}`]);
    kpis.push(["Completion", `${stats.completion}%`]);
  } else if (has("days") && !has("hours")) {
    kpis.push(["From", stats.firstDate]);
    kpis.push(["To", stats.lastDate]);
  } else if (has("hours") && stats.daysWorked) {
    kpis.push(["Avg hours / day", (stats.totalHours / stats.daysWorked).toFixed(1)]);
  }
  const charts: ReportChart[] = [];
  if (full || has("hours") || has("days")) {
    charts.push("hours");
  }
  if (full || has("tasks")) {
    charts.push("tasks");
  }
  const tables: ReportTable[] = [];
  if (full || has("attendance") || has("days") || has("hours")) {
    tables.push("attendance");
  }
  if (full || has("tasks")) {
    tables.push("tasks");
  }
  return {
    full,
    topics: selected,
    title,
    subtitle: full ? "Personal attendance report" : title,
    fileSlug,
    kpis: kpis.slice(0, 4),
    charts,
    tables,
  };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: ExcelJS.Border = { style: "thin", color: { argb: "FFD4D4D4" } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function bar(value: number, max: number): string {
  return "■■■■■■■■■■".slice(0, Math.max(1, Math.round((value / Math.max(1, max)) * 10)));
}

function writeSummaryChart(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  numberCols: number[] = []
): number {
  sheet.getCell(startRow, 1).value = title;
  sheet.getCell(startRow, 1).font = { bold: true, size: 13, color: { argb: "FF1A1A1A" } };
  const headerRow = sheet.getRow(startRow + 1);
  headerRow.values = [undefined, ...headers];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { horizontal: "center" };
  headerRow.eachCell((cell, col) => {
    if (col > 0) {
      cell.fill = fill("FFEE1C29");
      cell.border = thinBorder();
    }
  });
  rows.forEach((values, index) => {
    const row = sheet.getRow(startRow + 2 + index);
    row.values = [undefined, ...values];
    row.getCell(2).alignment = { horizontal: "center" };
    for (const col of numberCols) {
      row.getCell(col).numFmt = "0.00";
    }
    row.getCell(values.length + 1).font = { color: { argb: "FFEE1C29" } };
    row.eachCell((cell, col) => {
      if (col > 0) {
        cell.border = thinBorder();
        cell.fill = fill(index % 2 === 0 ? "FFFFFFFF" : "FFF7F7F7");
      }
    });
  });
  return startRow + rows.length + 4;
}

export async function buildHistoryExcel(
  employeeName: string,
  days: HistoryExportDay[],
  topics?: ReportTopic[]
): Promise<ExportFile> {
  const stats = reportStats(employeeName, days);
  const plan = createReportPlan(topics, stats);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StandardTouch";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary", {
    properties: { tabColor: { argb: "FFEE1C29" } },
    views: [{ showGridLines: false }],
  });
  summary.columns = [
    { width: 22 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  summary.mergeCells("A1:F1");
  summary.getRow(1).height = 28;
  Object.assign(summary.getCell("A1"), {
    value: "StandardTouch",
    font: { name: "Calibri", bold: true, size: 18, color: { argb: "FFFFFFFF" } },
    fill: fill("FFEE1C29"),
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  summary.mergeCells("A2:F2");
  Object.assign(summary.getCell("A2"), {
    value: plan.subtitle,
    font: { name: "Calibri", size: 12, color: { argb: "FFFFFFFF" } },
    fill: fill("FFC41620"),
    alignment: { vertical: "middle", indent: 1 },
  });
  summary.getRow(2).height = 20;

  const meta = [
    ["Employee", stats.employeeName, "Period", stats.period],
    ["Generated", stats.generated, "Working days", stats.daysWorked],
  ];
  meta.forEach((row, index) => {
    const excelRow = summary.getRow(4 + index);
    excelRow.values = [undefined, ...row];
    excelRow.getCell(1).font = { bold: true, color: { argb: "FF5C5C5C" } };
    excelRow.getCell(3).font = { bold: true, color: { argb: "FF5C5C5C" } };
    excelRow.getCell(2).font = { bold: true, color: { argb: "FF1A1A1A" } };
    excelRow.getCell(4).font = { bold: true, color: { argb: "FF1A1A1A" } };
  });

  const kpis = plan.kpis;
  kpis.forEach((item, index) => {
    const col = 1 + index;
    const title = summary.getCell(7, col);
    const value = summary.getCell(8, col);
    title.value = item[0];
    value.value = item[1];
    title.fill = fill("FFFDECEE");
    value.fill = fill("FFFDECEE");
    title.font = { name: "Calibri", size: 10, color: { argb: "FFEE1C29" }, bold: true };
    value.font = { name: "Calibri", size: 16, color: { argb: "FF1A1A1A" }, bold: true };
    title.alignment = { horizontal: "center" };
    value.alignment = { horizontal: "center" };
    title.border = thinBorder();
    value.border = thinBorder();
  });

  let cursor = 10;
  if (plan.charts.includes("hours")) {
    cursor = writeSummaryChart(
      summary,
      cursor,
      "Hours by day",
      ["Date", "Hours", "Hours bar"],
      stats.chronological.map((day) => [
        day.date,
        Number(day.hours.toFixed(2)),
        bar(day.hours, Math.max(1, ...stats.chronological.map((item) => item.hours))),
      ]),
      [3]
    );
  }
  if (plan.charts.includes("tasks")) {
    cursor = writeSummaryChart(
      summary,
      cursor,
      "Task completion",
      ["Date", "Done", "Total", "Done bar"],
      stats.chronological.map((day) => [
        day.date,
        day.done,
        day.total,
        bar(day.done, Math.max(1, ...stats.chronological.map((item) => item.total))),
      ])
    );
  }

  if (plan.tables.includes("attendance")) {
  const attendance = workbook.addWorksheet("Attendance", {
    properties: { tabColor: { argb: "FFF5C16C" } },
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  attendance.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "In", key: "login", width: 12 },
    { header: "Out", key: "logout", width: 12 },
    { header: "Hours", key: "hours", width: 12 },
    { header: "Done", key: "done", width: 10 },
    { header: "Total", key: "total", width: 10 },
    { header: "Completion", key: "rate", width: 14 },
  ];
  attendance.mergeCells("A1:G1");
  Object.assign(attendance.getCell("A1"), {
    value: `${stats.employeeName}  ·  ${plan.title}`,
    font: { bold: true, size: 14, color: { argb: "FFFFFFFF" } },
    fill: fill("FFEE1C29"),
    alignment: { vertical: "middle", indent: 1 },
  });
  attendance.getRow(1).height = 24;
  attendance.mergeCells("A2:G2");
  Object.assign(attendance.getCell("A2"), {
    value: stats.period,
    font: { size: 10, color: { argb: "FFFFFFFF" } },
    fill: fill("FFC41620"),
    alignment: { indent: 1 },
  });
  const attHeader = attendance.getRow(3);
  attHeader.values = ["Date", "In", "Out", "Hours", "Done", "Total", "Completion"];
  attHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  attHeader.alignment = { horizontal: "center" };
  attHeader.eachCell((cell) => {
    cell.fill = fill("FF2A2A2A");
    cell.border = thinBorder();
  });
  stats.chronological.forEach((day, index) => {
    const rate = day.total ? day.done / day.total : 0;
    const row = attendance.addRow({
      date: day.date,
      login: day.login || "—",
      logout: day.logout || "—",
      hours: Number(day.hours.toFixed(2)),
      done: day.done,
      total: day.total,
      rate,
    });
    row.getCell("hours").numFmt = "0.00";
    row.getCell("rate").numFmt = "0%";
    row.alignment = { vertical: "middle" };
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.fill = fill(index % 2 === 0 ? "FFFFFFFF" : "FFF7F7F7");
    });
  });
  if (stats.chronological.length) {
    attendance.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3 + stats.chronological.length, column: 7 },
    };
  }
  }

  if (plan.tables.includes("tasks")) {
  const tasks = workbook.addWorksheet("Tasks", {
    properties: { tabColor: { argb: "FF5EC8C0" } },
    views: [{ state: "frozen", ySplit: 3 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, paperSize: 9 },
  });
  tasks.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Task", key: "description", width: 52 },
    { header: "Project", key: "project", width: 22 },
    { header: "Actual", key: "actualTime", width: 12 },
  ];
  tasks.mergeCells("A1:E1");
  Object.assign(tasks.getCell("A1"), {
    value: `${stats.employeeName}  ·  ${plan.tables.includes("attendance") ? "Task log" : plan.title}`,
    font: { bold: true, size: 14, color: { argb: "FFFFFFFF" } },
    fill: fill("FFEE1C29"),
    alignment: { vertical: "middle", indent: 1 },
  });
  tasks.getRow(1).height = 24;
  tasks.mergeCells("A2:E2");
  Object.assign(tasks.getCell("A2"), {
    value: `${stats.tasksDone} of ${stats.tasksTotal} tasks completed`,
    font: { size: 10, color: { argb: "FFFFFFFF" } },
    fill: fill("FFC41620"),
    alignment: { indent: 1 },
  });
  const taskHeader = tasks.getRow(3);
  taskHeader.values = ["Date", "Status", "Task", "Project", "Actual"];
  taskHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  taskHeader.eachCell((cell) => {
    cell.fill = fill("FF2A2A2A");
    cell.border = thinBorder();
  });
  const statusFill: Record<string, string> = {
    Done: "FFE8F6EE",
    Pending: "FFFFF6E5",
    "In Progress": "FFE8F8F7",
    Dropped: "FFFDECEE",
  };
  const statusFont: Record<string, string> = {
    Done: "FF1B7A4A",
    Pending: "FF9A6B00",
    "In Progress": "FF0F6E68",
    Dropped: "FFEE1C29",
  };
  let taskCount = 0;
  stats.chronological.forEach((day) => {
    const rows = day.tasks.length
      ? day.tasks
      : [{ description: "No tasks recorded", status: "—", project: "", actualTime: "" }];
    for (const task of rows) {
      taskCount += 1;
      const row = tasks.addRow({
        date: day.date,
        status: task.status,
        description: task.description,
        project: task.project || "—",
        actualTime: task.actualTime || "—",
      });
      row.alignment = { vertical: "middle", wrapText: true };
      row.eachCell((cell) => {
        cell.border = thinBorder();
        cell.fill = fill(taskCount % 2 === 0 ? "FFF7F7F7" : "FFFFFFFF");
      });
      const tone = statusFill[task.status];
      if (tone) {
        row.getCell("status").fill = fill(tone);
        row.getCell("status").font = { bold: true, color: { argb: statusFont[task.status] } };
      }
    }
  });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    name: exportFileName(stats.employeeName, "xlsx", undefined, plan.fileSlug, reportFileDate(stats)),
    mimeType: XLSX_MIME,
    base64: buffer.toString("base64"),
  };
}

export async function buildHistoryPdf(
  employeeName: string,
  days: HistoryExportDay[],
  topics?: ReportTopic[]
): Promise<ExportFile> {
  const stats = reportStats(employeeName, days);
  const plan = createReportPlan(topics, stats);
  const doc = new PDFDocument({
    size: "A4",
    bufferPages: true,
    margins: { top: 0, left: 0, right: 0, bottom: 100 },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const layout = createPdfLayout(doc, stats);

  drawHeader(doc, stats, plan.title);
  layout.top = CONTENT_TOP + drawKpis(doc, stats, plan.kpis);

  if (plan.charts.includes("hours")) {
    layout.ensureBlock(168, plan.title);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Net hours trend", 40, layout.top, {
      lineBreak: false,
    });
    drawLineChart(doc, 40, layout.top + 18, 515, 130, stats.chronological, (day) => day.hours, BRAND, "h");
    layout.top += 168;
  }
  if (plan.charts.includes("tasks")) {
    layout.ensureBlock(178, plan.title);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Task completion", 40, layout.top, {
      lineBreak: false,
    });
    drawGroupedBars(doc, 40, layout.top + 18, 515, 140, stats.chronological);
    layout.top += 178;
  }
  if (plan.tables.includes("attendance")) {
    layout.ensureBlock(40, "Daily attendance");
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Daily attendance", 40, layout.top, {
      lineBreak: false,
    });
    layout.top += 18;
    drawAttendanceTable(doc, stats, layout);
  }
  if (plan.tables.includes("tasks")) {
    if (plan.tables.includes("attendance")) {
      layout.addSection("Task log");
    } else {
      layout.ensureBlock(40, "Task log");
      doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text("Task log", 40, layout.top, {
        lineBreak: false,
      });
      layout.top += 18;
    }
    drawTaskTable(doc, stats, layout);
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 0;
    doc.strokeColor(LINE).lineWidth(0.6).moveTo(40, FOOTER_Y - 10).lineTo(555, FOOTER_Y - 10).stroke();
    doc.fillColor(MUTED).font("Helvetica").fontSize(8);
    doc.text(
      `StandardTouch  ·  Generated ${stats.generated}  ·  Page ${index - range.start + 1} of ${range.count}`,
      40,
      FOOTER_Y,
      { width: 515, align: "center", lineBreak: false }
    );
  }
  doc.end();
  const buffer = await done;
  return {
    name: exportFileName(stats.employeeName, "pdf", undefined, plan.fileSlug, reportFileDate(stats)),
    mimeType: PDF_MIME,
    base64: buffer.toString("base64"),
  };
}

function resolveLogoPath(): string | undefined {
  const candidates = [
    join(process.cwd(), "public", "logo.png"),
    join(process.cwd(), "dist", "public", "logo.png"),
  ];
  return candidates.find((path) => existsSync(path));
}

function safeFilePart(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replaceAll(/[^\w]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return cleaned || "Employee";
}

function reportFileDate(stats: ReportStats) {
  if (stats.firstDate === stats.lastDate && /^\d{4}-\d{2}-\d{2}$/.test(stats.firstDate)) {
    return stats.firstDate;
  }
  return undefined;
}

export function exportFileName(
  employeeName: string,
  extension: "pdf" | "xlsx",
  now = new Date(),
  slug = "Attendance-Report",
  reportDate?: string
): string {
  const when =
    reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)
      ? reportDate
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
  return `StandardTouch-${slug}-${safeFilePart(employeeName)}-${when}.${extension}`;
}

function formatGeneratedAt(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(now);
  return `${date}, ${time}`;
}

function drawHeader(doc: PDFKit.PDFDocument, stats: ReportStats, section = "Attendance report") {
  doc.rect(0, 0, 595, HEADER_HEIGHT).fill("#FFFFFF");
  doc.rect(0, HEADER_HEIGHT, 595, 3).fill(BRAND);
  const logo = resolveLogoPath();
  if (logo) {
    doc.image(logo, 24, 16, { height: 48 });
  } else {
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(16).text("Standard", 28, 22, { continued: true });
    doc.fillColor("#2A2A2A").text("Touch");
    doc.fillColor(SILVER).font("Helvetica-Oblique").fontSize(9).text("e-Solutions", 28, 44);
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(section, 250, 14, {
    width: 320,
    align: "right",
    lineBreak: false,
  });
  doc.fillColor("#2A2A2A").font("Helvetica").fontSize(10).text(stats.employeeName, 250, 32, {
    width: 320,
    align: "right",
    lineBreak: false,
  });
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`Generated ${stats.generated}`, 250, 50, {
    width: 320,
    align: "right",
    lineBreak: false,
  });
}

function drawKpis(doc: PDFKit.PDFDocument, stats: ReportStats, items: Array<[string, string]>): number {
  const count = Math.max(1, items.length);
  const gap = 10;
  const cardWidth = (515 - gap * (count - 1)) / count;
  items.forEach((item, index) => {
    const x = 40 + index * (cardWidth + gap);
    doc.roundedRect(x, CONTENT_TOP, cardWidth, 58, 4).fill(PAPER).strokeColor(LINE).lineWidth(0.6).stroke();
    doc.fillColor(BRAND).font("Helvetica-Bold").fontSize(8).text(item[0].toUpperCase(), x + 10, CONTENT_TOP + 10, {
      width: cardWidth - 20,
    });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(item[1], x + 10, CONTENT_TOP + 28, {
      width: cardWidth - 20,
    });
  });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text(`Period ${stats.period}   ·   Report generated ${stats.generated}`, 40, CONTENT_TOP + 70, {
      width: 515,
    });
  return 88;
}

function shortDate(value: string): string {
  return value.slice(5);
}

function drawLineChart(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  days: HistoryExportDay[],
  valueOf: (day: HistoryExportDay) => number,
  color: string,
  unit: string
) {
  doc.roundedRect(x, y, width, height, 4).fill("#FFFFFF").strokeColor(LINE).lineWidth(0.6).stroke();
  const plotX = x + 36;
  const plotY = y + 16;
  const plotW = width - 52;
  const plotH = height - 42;
  const values = days.map(valueOf);
  const max = Math.max(1, ...values);
  doc.strokeColor(LINE).lineWidth(0.5);
  for (let step = 0; step <= 4; step += 1) {
    const gy = plotY + (plotH * step) / 4;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).stroke();
    doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(String(Math.round(max * (1 - step / 4))), x + 6, gy - 4, {
      width: 26,
      align: "right",
    });
  }
  if (!days.length) {
    doc.fillColor(MUTED).fontSize(10).text("No attendance days on this page.", plotX, plotY + plotH / 2);
    return;
  }
  const points = days.map((day, index) => {
    const px = plotX + (days.length === 1 ? plotW / 2 : (plotW * index) / (days.length - 1));
    const py = plotY + plotH - (valueOf(day) / max) * plotH;
    return { px, py, day };
  });
  doc.strokeColor(color).lineWidth(2);
  points.forEach((point, index) => {
    if (index === 0) {
      doc.moveTo(point.px, point.py);
    } else {
      doc.lineTo(point.px, point.py);
    }
  });
  doc.stroke();
  points.forEach((point) => {
    doc.circle(point.px, point.py, 3).fill(color);
  });
  const labelEvery = Math.ceil(days.length / 8);
  points.forEach((point, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) {
      return;
    }
    doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(shortDate(point.day.date), point.px - 16, plotY + plotH + 6, {
      width: 32,
      align: "center",
    });
  });
  doc.fillColor(MUTED).fontSize(7).text(unit, x + width - 24, y + 8);
}

function drawGroupedBars(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  days: HistoryExportDay[]
) {
  doc.roundedRect(x, y, width, height, 4).fill("#FFFFFF").strokeColor(LINE).lineWidth(0.6).stroke();
  const plotX = x + 36;
  const plotY = y + 22;
  const plotW = width - 52;
  const plotH = height - 48;
  const max = Math.max(1, ...days.map((day) => Math.max(day.total, day.done)));
  doc.fillColor(BRAND).font("Helvetica").fontSize(7).text("Done", plotX, y + 8);
  doc.rect(plotX + 28, y + 10, 8, 6).fill(BRAND);
  doc.fillColor(GOLD).text("Total", plotX + 44, y + 8);
  doc.rect(plotX + 72, y + 10, 8, 6).fill(GOLD);
  if (!days.length) {
    return;
  }
  const group = plotW / days.length;
  days.forEach((day, index) => {
    const gx = plotX + index * group;
    const totalH = (day.total / max) * plotH;
    const doneH = (day.done / max) * plotH;
    doc.rect(gx + group * 0.2, plotY + plotH - totalH, group * 0.28, totalH).fill(GOLD);
    doc.rect(gx + group * 0.52, plotY + plotH - doneH, group * 0.28, doneH).fill(BRAND);
  });
  const labelEvery = Math.ceil(days.length / 8);
  days.forEach((day, index) => {
    if (index % labelEvery !== 0 && index !== days.length - 1) {
      return;
    }
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(7)
      .text(shortDate(day.date), plotX + index * group, plotY + plotH + 6, {
        width: group,
        align: "center",
      });
  });
}

type PdfLayout = {
  top: number;
  addSection: (title: string) => void;
  ensureBlock: (needed: number, title: string) => void;
  ensureSpace: (needed: number, title: string, widths: number[], headers: string[]) => void;
};

function createPdfLayout(doc: PDFKit.PDFDocument, stats: ReportStats): PdfLayout {
  let top = CONTENT_TOP;
  return {
    get top() {
      return top;
    },
    set top(value: number) {
      top = value;
    },
    addSection(title: string) {
      doc.addPage();
      drawHeader(doc, stats, title);
      top = CONTENT_TOP;
    },
    ensureBlock(needed: number, title: string) {
      if (top + needed <= PAGE_CONTENT_BOTTOM) {
        return;
      }
      doc.addPage();
      drawHeader(doc, stats, title);
      top = CONTENT_TOP;
    },
    ensureSpace(needed: number, title: string, widths: number[], headers: string[]) {
      if (top + needed <= PAGE_CONTENT_BOTTOM) {
        return;
      }
      doc.addPage();
      drawHeader(doc, stats, title);
      top = CONTENT_TOP;
      drawTableRow(doc, 40, top, widths, headers, headerRowHeight(), true);
      top += headerRowHeight();
    },
  };
}

function headerRowHeight(): number {
  return 22;
}

function cellPadding(): number {
  return 6;
}

function wrapLongToken(token: string, max = 42): string {
  if (token.length <= max) {
    return token;
  }
  const chunks: string[] = [];
  let line = "";
  for (const piece of token.split(/(?<=[/?&=._-])/)) {
    if (line.length + piece.length > max && line) {
      chunks.push(line);
      line = piece;
    } else {
      line += piece;
    }
  }
  if (line) {
    chunks.push(line);
  }
  return chunks.flatMap((chunk) => chunk.match(new RegExp(`.{1,${max}}`, "g")) ?? [chunk]).join("\n");
}

function breakLongTokens(value: string): string {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\t", " ")
    .split(/(\s+)/)
    .map((token) => (/^\s+$/.test(token) ? token : wrapLongToken(token)))
    .join("");
}

function cellText(value: string): string {
  return breakLongTokens(value.trim() || "—");
}

function pushWrappedWord(
  doc: PDFKit.PDFDocument,
  lines: string[],
  word: string,
  maxWidth: number
): string {
  if (doc.widthOfString(word) <= maxWidth) {
    return word;
  }
  let line = "";
  for (const char of word) {
    const next = line + char;
    if (line && doc.widthOfString(next) > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  return line;
}

function linesForCell(doc: PDFKit.PDFDocument, value: string, width: number): string[] {
  doc.font("Helvetica").fontSize(8);
  const maxWidth = Math.max(12, width - cellPadding() * 2);
  const lines: string[] = [];
  for (const raw of breakLongTokens(value).split("\n")) {
    if (doc.widthOfString(raw) <= maxWidth) {
      lines.push(raw);
      continue;
    }
    let line = "";
    for (const word of raw.split(/(?<=\s)/)) {
      if (doc.widthOfString(line + word) <= maxWidth) {
        line += word;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trimEnd());
      }
      line = pushWrappedWord(doc, lines, word.trimStart(), maxWidth);
    }
    if (line.trim()) {
      lines.push(line.trimEnd());
    }
  }
  return lines.length ? lines : [""];
}

function measureCellHeight(doc: PDFKit.PDFDocument, value: string, width: number): number {
  return Math.max(10, linesForCell(doc, value, width).length * 10);
}

function measureRowHeight(doc: PDFKit.PDFDocument, values: string[], widths: number[]): number {
  const content = Math.max(
    10,
    ...values.map((value, index) => measureCellHeight(doc, value, widths[index] ?? 80))
  );
  return Math.ceil(content + cellPadding() * 2);
}

function splitFittingText(
  doc: PDFKit.PDFDocument,
  value: string,
  width: number,
  maxHeight: number
): { head: string; tail: string } {
  if (!value) {
    return { head: "", tail: "" };
  }
  const lines = linesForCell(doc, value, width);
  const maxLines = Math.max(1, Math.floor(maxHeight / 10));
  if (lines.length <= maxLines) {
    return { head: lines.join("\n"), tail: "" };
  }
  return {
    head: lines.slice(0, maxLines).join("\n"),
    tail: lines.slice(maxLines).join("\n"),
  };
}

function drawAttendanceTable(doc: PDFKit.PDFDocument, stats: ReportStats, layout: PdfLayout) {
  const headers = ["Date", "In", "Out", "Hours", "Tasks", "Rate"];
  const widths = [90, 80, 80, 70, 80, 85];
  drawTableRow(doc, 40, layout.top, widths, headers, headerRowHeight(), true);
  layout.top += headerRowHeight();
  stats.chronological.forEach((day, index) => {
    const rate = day.total ? `${Math.round((day.done / day.total) * 100)}%` : "—";
    const values = [
      cellText(day.date),
      cellText(day.login || "—"),
      cellText(day.logout || "—"),
      cellText(day.hours.toFixed(2)),
      cellText(`${day.done}/${day.total}`),
      cellText(rate),
    ];
    const height = Math.max(20, measureRowHeight(doc, values, widths));
    layout.ensureSpace(height, "Daily attendance", widths, headers);
    drawTableRow(doc, 40, layout.top, widths, values, height, false, index % 2 === 1);
    layout.top += height;
  });
}

function drawTaskTable(doc: PDFKit.PDFDocument, stats: ReportStats, layout: PdfLayout) {
  const headers = ["Date", "Status", "Task", "Project"];
  const widths = [70, 70, 280, 95];
  drawTableRow(doc, 40, layout.top, widths, headers, headerRowHeight(), true);
  layout.top += headerRowHeight();

  stats.chronological.forEach((day) => {
    const rows = day.tasks.length
      ? day.tasks
      : [{ description: "No tasks recorded", status: "—", project: "", actualTime: "" }];
    for (const task of rows) {
      let date = cellText(day.date);
      let status = cellText(task.status);
      let description = cellText(task.description);
      let project = cellText(task.project || "—");
      let continued = false;
      while (date || status || description || project) {
        const minChunk = 28;
        layout.ensureSpace(minChunk, "Task log", widths, headers);
        const available = PAGE_CONTENT_BOTTOM - layout.top;
        const fitted = [
          splitFittingText(doc, date, widths[0] ?? 78, available - cellPadding() * 2),
          splitFittingText(doc, status, widths[1] ?? 78, available - cellPadding() * 2),
          splitFittingText(doc, description, widths[2] ?? 254, available - cellPadding() * 2),
          splitFittingText(doc, project, widths[3] ?? 105, available - cellPadding() * 2),
        ];
        const values = [
          fitted[0]?.head || (continued ? cellText(day.date) : " "),
          fitted[1]?.head || (continued ? cellText(task.status) : " "),
          fitted[2]?.head || " ",
          fitted[3]?.head || (continued ? cellText(task.project || "—") : " "),
        ];
        const hasMore = fitted.some((part) => part.tail);
        const natural = Math.max(minChunk, measureRowHeight(doc, values, widths));
        const height = hasMore ? available : Math.min(available, natural);
        drawTableRow(doc, 40, layout.top, widths, values, height, false, false, continued ? "" : task.status);
        layout.top += height;
        date = fitted[0]?.tail ?? "";
        status = fitted[1]?.tail ?? "";
        description = fitted[2]?.tail ?? "";
        project = fitted[3]?.tail ?? "";
        continued = true;
      }
    }
  });
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  widths: number[],
  values: string[],
  height: number,
  header: boolean,
  zebra = false,
  status = ""
) {
  let cursor = x;
  const savedY = doc.y;
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  values.forEach((value, index) => {
    const width = widths[index] ?? 80;
    const background = header ? BRAND : statusColor(status) ?? (zebra ? PAPER : "#FFFFFF");
    doc.save();
    doc.rect(cursor, y, width, height).fill(background).strokeColor(LINE).lineWidth(0.4).stroke();
    doc.restore();
    doc.save();
    doc.rect(cursor, y, width, height).clip();
    doc.fillColor(header ? "#FFFFFF" : INK).font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    const lines = linesForCell(doc, value, width);
    let textY = y + cellPadding();
    const textX = cursor + cellPadding();
    const stopAt = y + height - 3;
    for (const line of lines) {
      if (textY + 8 > stopAt) {
        break;
      }
      doc.text(line, textX, textY, { lineBreak: false });
      textY += 10;
    }
    doc.restore();
    cursor += width;
  });
  doc.page.margins.bottom = savedBottom;
  doc.y = savedY;
}

function statusColor(status: string): string | undefined {
  if (status === "Done") return "#E8F6EE";
  if (status === "Pending") return "#FFF6E5";
  if (status === "In Progress") return "#E8F8F7";
  if (status === "Dropped") return "#FDECEE";
  return undefined;
}
