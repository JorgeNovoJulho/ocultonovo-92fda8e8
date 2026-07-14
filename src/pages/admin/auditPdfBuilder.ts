/**
 * PDF builder isolado para AdminAddressAuditPage.
 * Importado dinamicamente para que o jspdf (~415 KB) só
 * entre no bundle quando o admin clicar em "Exportar PDF".
 */
import jsPDF from "jspdf";
import { formatAuditStatus } from "@/components/settings/AddressSettings";

export type AuditRow = {
  id: string;
  profile_id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  email: string | null;
  lat: number;
  lng: number;
  address_text: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  source: string;
  status: string;
  status_detail: string | null;
  failure_reason: string | null;
  is_first_capture: boolean;
  captured_at: string;
};

export function buildAuditPdf(rows: AuditRow[], dateFrom?: string, dateTo?: string): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const marginTop = 14;
  const marginBottom = 14;
  const usableWidth = pageWidth - marginX * 2;

  const cols = {
    when:   { x: marginX,                                  w: 30 },
    user:   { x: marginX + 30,                             w: 38 },
    coords: { x: marginX + 30 + 38,                        w: 30 },
    addr:   { x: marginX + 30 + 38 + 30,                   w: 50 },
    status: { x: marginX + 30 + 38 + 30 + 50,              w: 38 },
  };

  let y = marginTop;
  let pageNum = 1;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text("Auditoria de Capturas GPS — Oculto Swing", marginX, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    const range = dateFrom || dateTo
      ? `Período: ${dateFrom || "início"} → ${dateTo || "hoje"} • `
      : "";
    doc.text(`${range}${rows.length} registros • Gerado em ${new Date().toLocaleString("pt-BR")}`, marginX, y);
    y += 5;
    doc.setDrawColor(180, 180, 180);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text("Data/Hora", cols.when.x, y);
    doc.text("Usuário", cols.user.x, y);
    doc.text("Coordenadas", cols.coords.x, y);
    doc.text("Endereço", cols.addr.x, y);
    doc.text("Status / Motivo", cols.status.x, y);
    y += 2;
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 2.5;
  };

  const drawFooter = () => {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `Página ${pageNum} • Confidencial — uso restrito ao Admin Master`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);

  for (const r of rows) {
    const when = new Date(r.captured_at).toLocaleString("pt-BR");
    const who = (r.username || r.display_name || r.email || "—") as string;
    const coords = `${Number(r.lat).toFixed(5)}\n${Number(r.lng).toFixed(5)}`;
    const addr = r.address_text
      || [r.address_street, r.address_city, r.address_state, r.address_cep].filter(Boolean).join(", ")
      || "—";
    const statusInfo = formatAuditStatus(r.status, r.status_detail, r.failure_reason);
    const statusText = `${statusInfo.label}${r.is_first_capture ? " ★ 1ª" : ""}\n${statusInfo.detail || ""}`.trim();

    const whenLines   = doc.splitTextToSize(when,       cols.when.w   - 1);
    const whoLines    = doc.splitTextToSize(who,        cols.user.w   - 1);
    const coordsLines = coords.split("\n");
    const addrLines   = doc.splitTextToSize(addr,       cols.addr.w   - 1);
    const statusLines = doc.splitTextToSize(statusText, cols.status.w - 1);

    const lineH = 3.2;
    const rowH = lineH * Math.max(whenLines.length, whoLines.length, coordsLines.length, addrLines.length, statusLines.length) + 1.5;

    if (y + rowH > pageHeight - marginBottom) {
      drawFooter();
      doc.addPage();
      pageNum += 1;
      y = marginTop;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
    }

    if (r.is_first_capture) {
      doc.setFillColor(255, 245, 250);
      doc.rect(marginX - 1, y - 2.6, usableWidth + 2, rowH, "F");
    }

    doc.text(whenLines,   cols.when.x,   y);
    doc.text(whoLines,    cols.user.x,   y);
    doc.text(coordsLines, cols.coords.x, y);
    doc.text(addrLines,   cols.addr.x,   y);

    if (/falh|error/i.test(statusInfo.label)) doc.setTextColor(180, 30, 30);
    else if (/verific/i.test(statusInfo.label)) doc.setTextColor(20, 120, 60);
    else doc.setTextColor(30, 30, 30);
    doc.text(statusLines, cols.status.x, y);
    doc.setTextColor(30, 30, 30);

    y += rowH;
    doc.setDrawColor(235, 235, 235);
    doc.line(marginX, y - 1, pageWidth - marginX, y - 1);
  }

  drawFooter();
  return doc.output("blob");
}
