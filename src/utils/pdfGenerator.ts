import {  jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Report,
  Inspection,
  TrainingCompletion,
  Training,
  BaseLegalRegister,
  EppDelivery,
  PreUseInspection,
  SSTDocument,
  DocumentSignature,
  Induction,
} from "../types";
import {  format } from "date-fns";
import {  es } from "date-fns/locale";
import {  getBase64ImageFromURL, getNormalizedPdfImage } from "./imageUtils";
import {
  createLetterheadDoc,
  ensureLetterheadLoaded,
  ensureSpace,
  getLayout,
  writeWrapped,
  drawDocTitle,
  addPageNumbers,
  getCurrentCompanyName,
  loadCompanyLogo,
} from "./pdfLetterhead";



/**
 * Agrega un sello digital de trazabilidad con la firma
 */
export const addTraceabilitySignature = (
  doc: jsPDF,
  signatureBase64: string,
  x: number,
  y: number,
  signerName: string,
  signerDni: string,
  email?: string | null,
  ip?: string | null,
  timestamp?: string,
) => {
  const boxWidth = 65;
  const textWidth = boxWidth - 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  const fit = (label: string) => {
    let text = label;
    while (doc.getTextWidth(text) > textWidth && text.length > 4) text = text.slice(0, -2);
    return text === label ? text : text.slice(0, -1) + "…";
  };
  const details = [
    fit(`Firmante: ${signerName}`),
    fit(`DNI: ${signerDni || "No registrado"}`),
    ...(email ? [fit(`Email: ${email}`)] : []),
    fit(`Fecha: ${timestamp || new Date().toLocaleString()}`),
  ];
  const boxHeight = 30 + details.length * 3;
  const { brandRgb } = getLayout(doc);

  doc.setDrawColor(...brandRgb);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([2, 2], 0);
  doc.rect(x, y, boxWidth, boxHeight);
  doc.setLineDashPattern([], 0);

  doc.setFillColor(252, 252, 252);
  doc.rect(x + 0.25, y + 0.25, boxWidth - 0.5, boxHeight - 0.5, "F");

  try {
    doc.addImage(signatureBase64, "PNG", x + 15, y + 2, 35, 18);
  } catch (e) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("(Firma)", x + boxWidth / 2, y + 10, { align: "center" });
  }

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(x + 5, y + 22, x + boxWidth - 5, y + 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...brandRgb);
  doc.text("FIRMA ELECTRÓNICA DE TRAZABILIDAD", x + boxWidth / 2, y + 26, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(80, 80, 80);
  details.forEach((line, i) => doc.text(line, x + 3, y + 30 + i * 3));

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  return y + boxHeight;
};

/**
 * Título del documento dentro de la hoja membretada. Devuelve la posición siguiente.
 */
const addHeader = (doc: jsPDF, title: string, subtitle?: string) =>
  drawDocTitle(doc, title, subtitle);

/**
 * Pie de página: fecha de generación y "Página X de Y".
 */
const addFooter = (doc: jsPDF) => addPageNumbers(doc);

/**
 * Tabla de datos de dos columnas con título a todo el ancho. Devuelve la posición siguiente.
 */
const addInfoTable = (doc: jsPDF, y: number, title: string, rows: [string, string][]) => {
  const layout = getLayout(doc);
  autoTable(doc, {
    startY: y,
    head: [[{ content: title, colSpan: 2 }]],
    body: rows.map(([k, v]) => [k, v || "-"]),
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9.5, cellPadding: 2.2, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 } },
  });
  return (doc as any).lastAutoTable.finalY + 8;
};

/**
 * Subtítulo de sección con el color de la empresa. Devuelve la posición siguiente.
 */
const addSubtitle = (doc: jsPDF, y: number, title: string) => {
  const layout = getLayout(doc);
  y = ensureSpace(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...layout.brandRgb);
  doc.text(title, layout.left, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  return y + 5.5;
};

/**
 * Sección con título y texto (o lista) que baja de renglón y de página. Devuelve la posición siguiente.
 */
const addSection = (doc: jsPDF, y: number, title: string, content: string | string[] | undefined) => {
  const layout = getLayout(doc);
  const items = Array.isArray(content) ? content.filter(Boolean) : content ? [content] : [];
  y = addSubtitle(doc, y, title);
  if (items.length === 0) {
    return writeWrapped(doc, "-", layout.left, y, layout.contentWidth, 4.8) + 4;
  }
  if (Array.isArray(content)) {
    items.forEach((item) => {
      doc.text("•", layout.left + 1, ensureSpace(doc, y, 4.8));
      y = writeWrapped(doc, item, layout.left + 5, y, layout.contentWidth - 5, 4.8);
    });
  } else {
    y = writeWrapped(doc, items[0], layout.left, y, layout.contentWidth, 4.8);
  }
  return y + 4;
};

/**
 * Cuadrícula de fotos (3 por fila) dentro de los márgenes; pasa de página por fila.
 * Devuelve la posición siguiente.
 */
const addPhotoGrid = async (doc: jsPDF, y: number, urls: string[]) => {
  const layout = getLayout(doc);
  const gap = 5;
  const w = (layout.contentWidth - gap * 2) / 3;
  const h = w * 0.75;
  let col = 0;
  for (const url of urls) {
    if (col === 0) y = ensureSpace(doc, y, h);
    const x = layout.left + col * (w + gap);
    try {
      const base64 = await getNormalizedPdfImage(url, 400, 300);
      doc.addImage(base64, "PNG", x, y, w, h);
    } catch (e) {
      doc.setDrawColor(200, 200, 200);
      doc.rect(x, y, w, h);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Imagen no disponible", x + w / 2, y + h / 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
    col += 1;
    if (col === 3) {
      col = 0;
      y += h + gap;
    }
  }
  return (col === 0 ? y : y + h + gap) + 3;
};

interface SignatureSlot {
  title: string;
  image?: string | null;
  name?: string;
  dni?: string;
  date?: string;
}

/**
 * Dos firmas lado a lado (izquierda y derecha). Sin imagen, deja la línea para firmar.
 * Si no caben, pasan juntas a la siguiente página. Devuelve la posición siguiente.
 */
const addSignatureRow = (doc: jsPDF, y: number, slots: SignatureSlot[]) => {
  const layout = getLayout(doc);
  let top = ensureSpace(doc, y, 62);
  const xs = [layout.left, layout.right - 65];
  let bottom = top;
  slots.slice(0, 2).forEach((slot, i) => {
    const x = slots.length === 1 ? layout.pageWidth / 2 - 32.5 : xs[i];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(slot.title, x, top);
    let end: number;
    if (slot.image) {
      end = addTraceabilitySignature(doc, slot.image, x, top + 3, slot.name || "", slot.dni || "No registrado", null, null, slot.date);
    } else {
      doc.setDrawColor(120, 120, 120);
      doc.line(x, top + 26, x + 65, top + 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const nameLines = doc.splitTextToSize(slot.name || "", 65) as string[];
      doc.text(nameLines, x, top + 31);
      end = top + 31 + nameLines.length * 4;
      if (slot.dni) {
        doc.text(`DNI: ${slot.dni}`, x, end);
        end += 4;
      }
    }
    bottom = Math.max(bottom, end);
  });
  return bottom + 8;
};

export const generateDocumentCargoPDF = async (
  document: SSTDocument,
  signature: DocumentSignature,
  companyName: string,
): Promise<Blob> => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);

  let currentY = addHeader(doc, "CARGO DE RECEPCIÓN DE DOCUMENTO", companyName);

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  const declaration = `Yo, ${signature.userName}, identificad@ con DNI/CE N° ${signature.userDni || "_______________"}, en mi calidad de trabajador, declaro haber recibido, leído y comprendido el documento detallado a continuación, comprometiéndome a cumplir todas las directrices, reglamentos o procedimientos indicados dentro del mismo, en conformidad con la Ley de Seguridad y Salud en el Trabajo N° 29783.`;
  currentY = writeWrapped(doc, declaration, layout.left, currentY, layout.contentWidth, 5.5);
  currentY += 4;

  let formatString = "";
  if (signature.timestamp && signature.timestamp.seconds) {
    const d = new Date(signature.timestamp.seconds * 1000);
    formatString = `${d.toLocaleDateString()} a las ${d.toLocaleTimeString()}`;
  } else {
    formatString = new Date().toLocaleString();
  }

  autoTable(doc, {
    startY: currentY,
    head: [[{ content: "Detalles del documento", colSpan: 2 }]],
    body: [
      ["Categoría", document.category || "Otros"],
      ["Denominación", document.title || ""],
      ["Versión", document.version || "1.0"],
      ["Fecha de acuse", formatString],
    ],
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9.5, cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
  });
  currentY = (doc as any).lastAutoTable.finalY + 10;

  if (signature.signatureBase64) {
    currentY = ensureSpace(doc, currentY, 45);
    addTraceabilitySignature(
      doc,
      signature.signatureBase64,
      layout.pageWidth / 2 - 32.5,
      currentY,
      signature.userName,
      signature.userDni || "No registrado",
      null,
      null,
      formatString,
    );
  }

  addFooter(doc);
  return doc.output("blob");
};

// ... existing code ...

export const generatePreUsePDF = async (
  preUse: PreUseInspection,
): Promise<Blob> => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);

  let y = addHeader(doc, "CHECKLIST PRE-USO DE EQUIPOS");

  // Estado del equipo
  const statusColor: [number, number, number] = preUse.isOperative ? [16, 185, 129] : [220, 38, 38];
  const statusText = preUse.isOperative ? "EQUIPO OPERATIVO" : "EQUIPO INOPERATIVO";
  doc.setFillColor(...statusColor);
  doc.roundedRect(layout.pageWidth / 2 - 25, y - 2, 50, 8, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(statusText, layout.pageWidth / 2, y + 3.4, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 11;

  const formattedDate = preUse.date
    ? typeof preUse.date.toDate === "function"
      ? format(preUse.date.toDate(), "dd/MM/yyyy HH:mm")
      : format(new Date(preUse.date as any), "dd/MM/yyyy HH:mm")
    : "Fecha desconocida";

  autoTable(doc, {
    startY: y,
    head: [[{ content: "Detalles generales", colSpan: 2 }]],
    body: [
      ["Equipo", preUse.equipmentName || "-"],
      ["Código / Placa", preUse.equipmentCode || "-"],
      ["Trabajador", preUse.workerName || "-"],
      ["Fecha", formattedDate],
    ],
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9.5, cellPadding: 2.2, overflow: "linebreak" },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Ítem evaluado", "Tipo", "Estado", "Observaciones"]],
    body: preUse.items.map((item) => [
      item.question,
      item.isCritical ? "Crítico" : "Normal",
      item.isOk ? "OK" : "MAL",
      item.comment || "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { cellWidth: 20, halign: "center" },
      2: { cellWidth: 18, halign: "center", fontStyle: "bold" },
      3: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (data.column.index === 2) {
        data.cell.styles.textColor = data.cell.raw === "OK" ? [16, 150, 100] : [220, 38, 38];
      }
      if (data.column.index === 1 && data.cell.raw === "Crítico") {
        data.cell.styles.textColor = [220, 38, 38];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  if (preUse.attachmentUrls && preUse.attachmentUrls.length > 0) {
    let evidenceY = ensureSpace(doc, (doc as any).lastAutoTable.finalY + 8, 20);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Evidencia / documentos adjuntos", layout.left, evidenceY);
    autoTable(doc, {
      startY: evidenceY + 3,
      head: [["Nombre / vínculo", "Tipo"]],
      body: preUse.attachmentUrls.map((a) => [
        a.url.startsWith("data:") ? "[Imagen adjunta en la app]" : a.url,
        a.type === "video" ? "Video" : "Imagen",
      ]),
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb },
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: "auto", textColor: [37, 99, 235] }, 1: { cellWidth: 25 } },
    });
  }

  // Firmas: trabajador a la izquierda, supervisor a la derecha
  let finalY = ensureSpace(doc, (doc as any).lastAutoTable.finalY + 12, 62);
  const rightX = layout.right - 65;
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("Trabajador / operador", layout.left, finalY);
  doc.text("Supervisor SST", rightX, finalY);
  let leftEnd = finalY + 4;
  let rightEnd = finalY + 4;

  if (preUse.signature) {
    leftEnd = addTraceabilitySignature(
      doc, preUse.signature, layout.left, finalY + 4,
      preUse.workerName, preUse.workerDni || "No registrado", null, null, formattedDate,
    );
  } else {
    doc.setFont("helvetica", "normal");
    doc.text("(Firma no disponible)", layout.left, finalY + 14);
  }

  if (preUse.supervisorSignatureUrl) {
    try {
      const supervisorSig = await getNormalizedPdfImage(preUse.supervisorSignatureUrl, 420, 216);
      rightEnd = addTraceabilitySignature(
        doc, supervisorSig, rightX, finalY + 4,
        preUse.supervisorName || "Supervisor", preUse.supervisorDni || "No registrado", null, null, formattedDate,
      );
    } catch (e) {
      console.error("Error drawing supervisor sig", e);
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Pendiente de firma", rightX, finalY + 14);
    doc.setDrawColor(150, 150, 150);
    doc.line(rightX, finalY + 30, rightX + 65, finalY + 30);
    doc.setTextColor(0, 0, 0);
  }

  addFooter(doc);
  return doc.output("blob");
};

export const generateEppDeliveryPdf = async (
  delivery: EppDelivery,
  company: any,
) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  const when = delivery.deliveryDate?.toDate ? delivery.deliveryDate.toDate() : null;

  let y = addHeader(doc, "ACTA DE ENTREGA DE EPP", company?.businessName);
  y = addInfoTable(doc, y, "Datos de la entrega", [
    ["Empresa", company?.businessName || "-"],
    ["RUC", company?.ruc || "-"],
    ["Fecha de entrega", when ? when.toLocaleDateString() : "-"],
    ["Trabajador", delivery.workerName],
    ["DNI", delivery.workerDni],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["N°", "Equipo de protección personal", "Cant.", "Motivo"]],
    body: delivery.items.map((item, idx) => [idx + 1, item.name, item.quantity, item.reason || "-"]),
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9.5, cellPadding: 2.2, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 16, halign: "center" }, 3: { cellWidth: 50 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Declaración", layout.left, y);
  doc.setFont("helvetica", "normal");
  y = writeWrapped(
    doc,
    "Declaro que he recibido los Equipos de Protección Personal (EPP) indicados en este documento, los cuales se encuentran en buen estado. Me comprometo a utilizarlos correctamente, cuidarlos y solicitar su cambio cuando presenten deterioro.",
    layout.left, y + 5, layout.contentWidth, 5,
  );

  if (delivery.notes) {
    y = ensureSpace(doc, y + 3, 12);
    doc.setFont("helvetica", "bold");
    doc.text("Notas adicionales", layout.left, y);
    doc.setFont("helvetica", "normal");
    y = writeWrapped(doc, delivery.notes, layout.left, y + 5, layout.contentWidth, 5);
  }

  let supervisorSig: string | null = null;
  if (delivery.supervisorSignatureUrl) {
    try {
      supervisorSig = await getNormalizedPdfImage(delivery.supervisorSignatureUrl, 420, 216);
    } catch (e) {
      console.error(e);
    }
  }
  const dateText = when ? when.toLocaleString() : new Date().toLocaleString();
  addSignatureRow(doc, y + 8, [
    { title: "Trabajador", image: delivery.signature, name: delivery.workerName, dni: delivery.workerDni, date: dateText },
    { title: "Supervisor SST", image: supervisorSig, name: delivery.supervisorName || "Supervisor", dni: delivery.supervisorDni, date: dateText },
  ]);

  addFooter(doc);
  doc.save(
    `Entrega_EPP_${delivery.workerDni}_${when ? when.toISOString().split("T")[0] : "Doc"}.pdf`,
  );
};

/**
 * Generate PDF for Digital Signature Consent
 */
export const generateDigitalSignatureConsentPDF = async (
  profile: any,
  companyName: string
) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  let y = addHeader(doc, "DECLARACIÓN JURADA DE USO DE FIRMA ELECTRÓNICA", companyName);

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  y = writeWrapped(
    doc,
    `Por el presente documento, yo, ${profile.displayName}${profile.dni ? `, identificado con DNI: ${profile.dni}` : ""}, declaro y acepto bajo juramento que:`,
    layout.left, y, layout.contentWidth, 5.5,
  );
  y += 3;
  const points = [
    `He sido informado(a) y acepto de manera libre y voluntaria el uso de los sistemas de información de ${companyName} para mis labores, lo que incluye la firma de documentos electrónicos.`,
    `Reconozco que la firma trazada o capturada en esta plataforma (firma en pantalla / firma electrónica) tendrá el mismo valor legal y probatorio que mi firma manuscrita u ológrafa, en virtud de la Ley N° 27269, Ley de Firmas y Certificados Digitales, y sus modificatorias u otras normativas legales vigentes.`,
    `Me comprometo a salvaguardar los medios de acceso a la plataforma (usuario y contraseña) a través de los cuales genero dichos documentos con mi firma gráfica almacenada o trazada.`,
    `Autorizo a que dicha firma sea insertada de manera automática en los diferentes registros, constancias, inspecciones o reportes documentales de mi empresa.`,
  ];
  points.forEach((point, index) => {
    doc.text(`${index + 1}.`, layout.left + 2, ensureSpace(doc, y, 5.5));
    y = writeWrapped(doc, point, layout.left + 8, y, layout.contentWidth - 8, 5.5) + 2;
  });
  y += 3;
  doc.setFont("helvetica", "bold");
  y = writeWrapped(doc, "He leído, comprendido y acepto las condiciones establecidas en la presente declaración jurada.", layout.left, y, layout.contentWidth, 5.5);

  const sigUrl = profile.savedSignatureUrl || profile.digitalSignatureConsent?.signatureUrl;
  if (sigUrl) {
    try {
      const base64data = await getNormalizedPdfImage(sigUrl, 420, 216);
      const consentedAt = profile.digitalSignatureConsent?.consentedAt?.toDate
        ? profile.digitalSignatureConsent.consentedAt.toDate().toLocaleString()
        : new Date().toLocaleString();
      addSignatureRow(doc, y + 10, [
        { title: "Firma del trabajador", image: base64data, name: profile.displayName, dni: profile.dni, date: consentedAt },
      ]);
    } catch (e) {
      console.error("Error drawing signature", e);
    }
  }

  addFooter(doc);
  doc.save(`Declaracion_Jurada_${profile.dni || profile.uid}.pdf`);
};

/**
 * Generate PDF for a single Report
 */
export const generateReportPDF = async (report: Report) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  let y = addHeader(doc, "REPORTE DE INCIDENTE / CONDICIÓN");

  y = addInfoTable(doc, y, "Datos del reporte", [
    ["ID de reporte", report.id || "N/A"],
    ["Tipo de reporte", (report.type || "reporte").toUpperCase().replace("_", " ")],
    ["Fecha del suceso", report.date],
    ["Ubicación", report.location],
    ["Reportado por", report.reportedByName],
    ["Estado", report.status === "pending" ? "PENDIENTE" : "REVISADO"],
    ["Fecha de registro", report.createdAt?.toDate ? format(report.createdAt.toDate(), "dd/MM/yyyy HH:mm") : "N/A"],
  ]);

  y = addSection(doc, y, "Descripción del suceso", report.description);

  if (report.comments && report.comments.length > 0) {
    y = ensureSpace(doc, y + 2, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...layout.brandRgb);
    doc.text("Comentarios y seguimiento", layout.left, y);
    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      startY: y + 3,
      head: [["Fecha", "Autor", "Comentario"]],
      body: report.comments.map((c) => [
        format(c.createdAt?.toDate ? c.createdAt.toDate() : new Date(), "dd/MM/yyyy"),
        c.authorName,
        c.text,
      ]),
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb },
      styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 40 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (report.investigation) {
    const inv = report.investigation;
    doc.addPage();
    y = addHeader(doc, "INVESTIGACIÓN DE INCIDENTE / ACCIDENTE");
    y = addInfoTable(doc, y, "Detalles de la investigación", [
      ["Metodología", inv.methodology],
      ["Realizado por", inv.conductedByName],
      ["Fecha de investigación", inv.conductedAt ? new Date(inv.conductedAt.seconds * 1000).toLocaleDateString() : ""],
    ]);
    y = addSection(doc, y, "Resumen", inv.summary);
    if (inv.development) y = addSection(doc, y, "Desarrollo de la metodología", inv.development);
    y = addSection(doc, y, "Causas inmediatas", inv.immediateCauses || []);
    y = addSection(doc, y, "Causas básicas", inv.basicCauses || []);
    y = addSection(doc, y, "Medidas correctivas", inv.correctiveMeasures || []);
    y = addSection(doc, y, "Medidas preventivas", inv.preventiveMeasures || []);
  }

  if (report.legalRegister) {
    doc.addPage();
    await addLegalRegisterToDoc(doc, report.legalRegister);
  }

  addFooter(doc);
  doc.save(`Reporte_SST_${report.id || format(new Date(), "yyyyMMdd")}.pdf`);
};

/**
 * Helper to add a legal register to an existing PDF document
 */
const addLegalRegisterToDoc = async (doc: jsPDF, lr: any) => {
  let title = "REGISTRO DE SEGURIDAD Y SALUD EN EL TRABAJO";
  switch (lr.type) {
    case "accident":
      title = "REGISTRO DE ACCIDENTES DE TRABAJO";
      break;
    case "disease":
      title = "REGISTRO DE ENFERMEDADES OCUPACIONALES";
      break;
    case "incident":
      title = "REGISTRO DE INCIDENTES PELIGROSOS E INCIDENTES";
      break;
    case "medical_exam":
      title = "REGISTRO DE EXÁMENES MÉDICOS OCUPACIONALES";
      break;
    case "monitoring":
      title =
        "REGISTRO DEL MONITOREO DE AGENTES FÍSICOS, QUÍMICOS, BIOLÓGICOS, PSICOSOCIALES Y FACTORES DE RIESGO DISERGONÓMICOS";
      break;
    case "inspection":
      title =
        "REGISTRO DE INSPECCIONES INTERNAS DE SEGURIDAD Y SALUD EN EL TRABAJO";
      break;
    case "statistics":
      title = "REGISTRO DE ESTADÍSTICAS DE SEGURIDAD Y SALUD";
      break;
    case "equipment":
      title = "REGISTRO DE EQUIPOS DE SEGURIDAD O EMERGENCIA";
      break;
    case "training":
      title =
        "REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA";
      break;
    case "audit":
      title = "REGISTRO DE AUDITORÍAS";
      break;
  }

  const brand = getLayout(doc).brandRgb;
  let startY = addHeader(doc, title, `N° de registro: ${lr.registerNumber}`);

  // 1. Datos del Empleador Principal
  autoTable(doc, {
    startY,
    head: [[{ content: "1. Datos del Empleador Principal", colSpan: 2 }]],
    body: [
      ["Razón Social", lr.businessName],
      ["RUC", lr.ruc],
      ["Domicilio", lr.address],
      ["Actividad Económica", lr.economicActivity],
      ["N° Trabajadores", lr.totalWorkers.toString()],
      ...(lr.type === "disease"
        ? [
            ["Año de Inicio de la Actividad", (lr as any).startYear || "-"],
            [
              "Líneas de Producción y/o Servicios",
              (lr as any).productionLines || "-",
            ],
          ]
        : []),
      [
        "N° Trabajadores Afiliados al SCTR",
        lr.sctrAffiliated?.toString() || "0",
      ],
      [
        "N° Trabajadores NO Afiliados al SCTR",
        lr.sctrNotAffiliated?.toString() || "0",
      ],
      ["Nombre de la Aseguradora", lr.insuranceName || "-"],
    ],
    theme: "grid",
    headStyles: { fillColor: brand },
  });

  if (lr.isIntermediation) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "1.5. Datos del Empleador de Intermediación", colSpan: 2 }]],
      body: [
        ["Razón Social", lr.interBusinessName || "-"],
        ["RUC", lr.interRuc || "-"],
        ["Domicilio", lr.interAddress || "-"],
        ["Actividad Económica", lr.interEconomicActivity || "-"],
        ["N° Trabajadores", lr.interTotalWorkers?.toString() || "0"],
        ...(lr.type === "disease"
          ? [
              [
                "Año de Inicio de la Actividad",
                (lr as any).interStartYear || "-",
              ],
              [
                "Líneas de Producción y/o Servicios",
                (lr as any).interProductionLines || "-",
              ],
            ]
          : []),
        [
          "N° Trabajadores Afiliados al SCTR",
          lr.interSctrAffiliated?.toString() || "0",
        ],
        [
          "N° Trabajadores NO Afiliados al SCTR",
          lr.interSctrNotAffiliated?.toString() || "0",
        ],
        ["Nombre de la Aseguradora", lr.interInsuranceName || "-"],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });
  }

  // Specific Sections based on type
  if (lr.type === "accident") {
    const acc = lr;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos del Trabajador", colSpan: 2 }]],
      body: [
        ["Nombres y Apellidos", acc.workerName],
        ["DNI / CE", acc.workerDocument],
        ["Edad", acc.workerAge.toString()],
        ["Género", acc.workerGender === "M" ? "Masculino" : "Femenino"],
        ["Área", acc.workerArea],
        ["Puesto", acc.workerPosition],
        ["Antigüedad", acc.workerSeniority],
        [
          "Turno",
          acc.workerShift === "D"
            ? "Día"
            : acc.workerShift === "T"
              ? "Tarde"
              : "Noche",
        ],
        ["Tipo de Contrato", acc.workerContractType],
        ["Tiempo de Experiencia en el Puesto", acc.workerExperience],
        [
          "N° Horas Trabajadas Antes del Accidente",
          acc.hoursWorkedBeforeAccident.toString(),
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "3. Datos del Accidente", colSpan: 2 }]],
      body: [
        ["Fecha", acc.accidentDate],
        ["Lugar exacto", acc.exactLocation],
        ["Gravedad", acc.accidentGravity],
        ...(acc.accidentGravity === "Incapacitante"
          ? [["Grado de Incapacidad", acc.incapacityDegree || "-"]]
          : []),
        ["N° Días Descanso Médico", acc.medicalRestDays.toString()],
        ["N° Trabajadores Afectados", acc.affectedWorkersCount.toString()],
        ["Parte del cuerpo afectada", acc.injuredBodyPart],
        ["Descripción", acc.accidentDescription],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "4. Investigación y Medidas", colSpan: 2 }]],
      body: [
        ["Fecha de Inicio de la Investigación", acc.investigationStartDate],
        ["Causas (Resumen)", acc.causesDescription],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });
  } else if (lr.type === "disease") {
    const dis = lr as any;

    // Monthly cases table
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]],
      body: [dis.monthlyCases || Array(12).fill(0)],
      theme: "grid",
      headStyles: { fillColor: brand, fontSize: 8 },
      styles: { fontSize: 8, halign: "center" },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 5,
      head: [[{ content: "2. Datos de la Enfermedad", colSpan: 2 }]],
      body: [
        ["Nombre de la Enfermedad", dis.diseaseName],
        ["Agente Causante", dis.specificAgent],
        ["Tipo de Agente", dis.agentType],
        ["Parte del cuerpo afectada", dis.affectedBodyPart],
        ["N° Trabajadores Afectados", dis.affectedWorkersCount.toString()],
        ["Áreas", dis.areas],
        ["N° Cambios de Puesto", dis.positionChangesCount.toString()],
        ["Descripción del Trabajo", dis.workDescription],
        ["Detalle de las Causas", dis.causesDetail],
        ...(dis.causesName ? [["Documento de Causas", dis.causesName]] : []),
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    if (dis.carcinogenicSubstances) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Sustancias Cancerígenas", "Monitoreo"]],
        body: [
          [dis.carcinogenicSubstances, dis.hasAgentMonitoring ? "SÍ" : "NO"],
        ],
        theme: "grid",
        headStyles: { fillColor: [180, 83, 9] },
      });
    }
  } else if (lr.type === "incident") {
    const inc = lr;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos del Incidente", colSpan: 2 }]],
      body: [
        ["Tipo de Suceso", inc.incidentType],
        ["Fecha", inc.incidentDate],
        ["Hora", inc.incidentTime],
        ["Lugar exacto", inc.exactLocation],
        [
          "N° Trabajadores Potencialmente Afectados",
          inc.potentiallyAffectedWorkers?.toString() || "0",
        ],
        [
          "Población Potencialmente Afectada",
          inc.potentiallyAffectedPopulation?.toString() || "0",
        ],
        ["Detalle de Atención en Primeros Auxilios", inc.firstAidDetail || "-"],
        ["N° Testigos", inc.witnessesCount?.toString() || "0"],
        ["Descripción", inc.incidentDescription],
        ["Causas (Resumen)", inc.causesDescription],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });
  } else if (lr.type === "medical_exam") {
    const med = lr;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos del Trabajador y Examen", colSpan: 2 }]],
      body: [
        ["Trabajador", med.workerName],
        ["DNI", med.workerDocument],
        ["Edad", med.workerAge.toString()],
        ["Género", med.workerGender === "M" ? "Masculino" : "Femenino"],
        ["Área", med.workerArea],
        ["Puesto", med.workerPosition],
        ["Fecha del Examen", med.examDate],
        ["Tipo de Examen", med.examType],
        ["Centro Médico", med.medicalCenter],
        ["Resultado", med.examResult],
        ["Recomendaciones", med.recommendations],
        ...(med.certificateName
          ? [["Certificado Adjunto", med.certificateName]]
          : []),
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    // Confidentiality Note
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100);
    const confNote =
      "NOTA: Los resultados de los exámenes médicos son confidenciales y se encuentran bajo custodia del médico ocupacional. Este registro solo certifica la aptitud del trabajador conforme a Ley.";
    writeWrapped(doc, confNote, getLayout(doc).left, ensureSpace(doc, finalY, 12), getLayout(doc).contentWidth, 4);
    doc.setTextColor(0);
  } else if (lr.type === "monitoring") {
    const mon = lr;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos del Monitoreo", colSpan: 2 }]],
      body: [
        ["Área Monitoreada", mon.monitoredArea],
        ["Fecha", mon.monitoringDate],
        ["Tipo de Riesgo", mon.riskType],
        ["Agente Monitoreado", mon.agentMonitored],
        ["¿Cuenta con programa?", mon.hasMonitoringProgram ? "SÍ" : "NO"],
        ["Frecuencia", mon.frequency],
        ["N° Trabajadores Expuestos", mon.exposedWorkersCount.toString()],
        ["Organización que realiza el monitoreo", mon.monitoringOrganization],
        ["Resultados", mon.results],
        ["Causas de desviaciones", mon.deviationsCauses],
        ["Conclusiones y Recomendaciones", mon.conclusions],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    // Attachments section in PDF
    const attachments = [];
    if (mon.programName) attachments.push(["Programa Anual", mon.programName]);
    if (mon.reportName)
      attachments.push(["Informe de Resultados", mon.reportName]);
    if (mon.calibrationName)
      attachments.push(["Certificado de Calibración", mon.calibrationName]);

    if (attachments.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 5,
        head: [["Documentos Adjuntos", "Archivo"]],
        body: attachments,
        theme: "grid",
        headStyles: { fillColor: [100, 116, 139] },
      });
    }
  } else if (lr.type === "inspection") {
    const ins = lr;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos de la Inspección", colSpan: 2 }]],
      body: [
        ["Área Inspeccionada", ins.inspectedArea],
        ["Fecha", ins.inspectionDate],
        ["Hora", ins.inspectionTime],
        ["Tipo de Inspección", ins.inspectionType],
        ["Responsable del Área", ins.inspectedAreaResponsible],
        ["Responsable de la Inspección", ins.inspectionResponsible],
        ["Objetivo", ins.objective],
        ["Resultado", ins.result],
        [
          "Causas ante Resultados Desfavorables",
          ins.unfavorableResultsCauses || "-",
        ],
        ["Conclusiones", ins.conclusions],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });
  } else if (lr.type === "equipment") {
    const eq = lr as any;

    // Pre-fetch signatures
    const signatures: Record<string, string> = {};
    if (eq.delivererSignatureUrl) {
      try {
        signatures[eq.delivererSignatureUrl] = await getNormalizedPdfImage(
          eq.delivererSignatureUrl,
          420,
          216
        );
      } catch (e) {
        console.warn("Failed to fetch deliverer signature", e);
      }
    }
    if (eq.workers && eq.workers.length > 0) {
      for (const w of eq.workers) {
        if (w.signatureUrl && !signatures[w.signatureUrl]) {
          try {
            signatures[w.signatureUrl] = await getNormalizedPdfImage(
              w.signatureUrl,
              420,
              216
            );
          } catch (e) {
            console.warn("Failed to fetch worker signature", e);
          }
        }
      }
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos del Equipo", colSpan: 2 }]],
      body: [
        ["Tipo de Equipo", eq.equipmentType],
        ["Nombre del Equipo", eq.equipmentNames],
        ["Entregado Por", eq.deliveredBy || "-"],
        ["Firma Entregador", ""],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
      styles: { minCellHeight: 15, valign: "middle" },
      didDrawCell: (data) => {
        if (
          data.section === "body" &&
          data.row.index === 3 &&
          data.column.index === 1
        ) {
          if (
            eq.delivererSignatureUrl &&
            signatures[eq.delivererSignatureUrl]
          ) {
            try {
              doc.addImage(
                signatures[eq.delivererSignatureUrl],
                "PNG",
                data.cell.x + 2,
                data.cell.y + 2,
                data.cell.width - 4,
                data.cell.height - 8,
              );
              if (eq.delivererSignedByEmail) {
                doc.setFontSize(6);
                doc.setTextColor(100);
                doc.text(
                  eq.delivererSignedByEmail,
                  data.cell.x + 2,
                  data.cell.y + data.cell.height - 2,
                );
              }
            } catch (e) {
              console.error("Error adding deliverer signature to PDF:", e);
            }
          }
        }
      },
    });

    if (eq.workers && eq.workers.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [
          ["Nombre", "DNI", "Área", "F. Entrega", "F. Renovación", "Firma"],
        ],
        body: eq.workers.map((w: any) => [
          w.name,
          w.dni,
          w.area,
          w.deliveryDate,
          w.renewalDate,
          "",
        ]),
        theme: "grid",
        headStyles: { fillColor: brand },
        styles: { minCellHeight: 15, valign: "middle" },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const worker = eq.workers[data.row.index];
            if (worker.signatureUrl && signatures[worker.signatureUrl]) {
              try {
                doc.addImage(
                  signatures[worker.signatureUrl],
                  "PNG",
                  data.cell.x + 2,
                  data.cell.y + 2,
                  data.cell.width - 4,
                  data.cell.height - 8,
                );
                if (worker.signedByEmail) {
                  doc.setFontSize(6);
                  doc.setTextColor(100);
                  doc.text(
                    worker.signedByEmail,
                    data.cell.x + 2,
                    data.cell.y + data.cell.height - 2,
                  );
                }
              } catch (e) {
                console.error("Error adding worker signature to PDF:", e);
              }
            }
          }
        },
      });
    }
  } else if (lr.type === "training") {
    const tr = lr as any;

    // Pre-fetch signatures
    const signatures: Record<string, string> = {};
    if (tr.trainerSignatureUrl) {
      try {
        signatures[tr.trainerSignatureUrl] = await getNormalizedPdfImage(
          tr.trainerSignatureUrl,
          420,
          216
        );
      } catch (e) {
        console.warn("Failed to fetch trainer signature", e);
      }
    }
    if (tr.workers && tr.workers.length > 0) {
      for (const w of tr.workers) {
        if (w.signatureUrl && !signatures[w.signatureUrl]) {
          try {
            signatures[w.signatureUrl] = await getNormalizedPdfImage(
              w.signatureUrl,
              420,
              216
            );
          } catch (e) {
            console.warn("Failed to fetch worker signature", e);
          }
        }
      }
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos de la Capacitación / Entrenamiento", colSpan: 2 }]],
      body: [
        ["Tipo", tr.trainingType || "-"],
        ["Tema", tr.trainingTopic || tr.topic || "-"],
        ["Fecha", tr.trainingDate || tr.date || "-"],
        [
          "N° Horas",
          tr.trainingHours?.toString() || tr.hours?.toString() || "0",
        ],
        ["Nombre del Capacitador", tr.trainerName || "-"],
        ["Firma del Capacitador", ""],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
      styles: { minCellHeight: 15, valign: "middle" },
      didDrawCell: (data) => {
        if (
          data.section === "body" &&
          data.row.index === 5 &&
          data.column.index === 1
        ) {
          if (tr.trainerSignatureUrl && signatures[tr.trainerSignatureUrl]) {
            try {
              doc.addImage(
                signatures[tr.trainerSignatureUrl],
                "PNG",
                data.cell.x + 2,
                data.cell.y + 2,
                data.cell.width - 4,
                data.cell.height - 8,
              );
              if (tr.trainerSignedByEmail) {
                doc.setFontSize(6);
                doc.setTextColor(100);
                doc.text(
                  tr.trainerSignedByEmail,
                  data.cell.x + 2,
                  data.cell.y + data.cell.height - 2,
                );
              }
            } catch (e) {
              console.error("Error adding trainer signature to PDF:", e);
            }
          }
        }
      },
    });

    if (tr.workers && tr.workers.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Nombre", "DNI", "Área", "Firma", "Observaciones"]],
        body: tr.workers.map((w: any) => [
          w.name,
          w.dni,
          w.area,
          "",
          w.observations || "-",
        ]),
        theme: "grid",
        headStyles: { fillColor: brand },
        styles: { minCellHeight: 15, valign: "middle" },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 3) {
            const worker = tr.workers[data.row.index];
            if (worker.signatureUrl && signatures[worker.signatureUrl]) {
              try {
                doc.addImage(
                  signatures[worker.signatureUrl],
                  "PNG",
                  data.cell.x + 2,
                  data.cell.y + 2,
                  data.cell.width - 4,
                  data.cell.height - 8,
                );
                if (worker.signedByEmail) {
                  doc.setFontSize(6);
                  doc.setTextColor(100);
                  doc.text(
                    worker.signedByEmail,
                    data.cell.x + 2,
                    data.cell.y + data.cell.height - 2,
                  );
                }
              } catch (e) {
                console.error("Error adding worker signature to PDF:", e);
              }
            }
          }
        },
      });
    }
  } else if (lr.type === "statistics") {
    const stat = lr as any;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [
        ["2. Registro de Estadísticas de Seguridad y Salud en el Trabajo", ""],
      ],
      body: [["Año", stat.year || new Date().getFullYear()]],
      theme: "grid",
      headStyles: { fillColor: brand },
    });

    if (stat.monthlyStats && stat.monthlyStats.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 5,
        head: [
          [
            "MES",
            "ACCID. MORTAL",
            "ACCID. LEVE",
            "ACCID. INCAPAC.",
            "H.H. TRAB.",
            "I.F.",
            "DÍAS PERD.",
            "I.G.",
            "I.A.",
            "ENF. OCUP.",
            "T.I.",
            "INCID. PELIG.",
            "INCID.",
          ],
        ],
        body: stat.monthlyStats.map((m: any) => [
          m.month,
          m.fatalAccidentsCount || 0,
          m.slightAccidentsCount || 0,
          m.incapacitatingAccidentsCount || 0,
          m.totalHoursWorked || 0,
          m.frequencyIndex || 0,
          m.lostDays || 0,
          m.severityIndex || 0,
          m.accidentabilityIndex || 0,
          m.occupationalDiseasesCount || 0,
          m.incidenceRate || 0,
          m.dangerousIncidentsCount || 0,
          m.incidentsCount || 0,
        ]),
        theme: "grid",
        headStyles: { fillColor: brand, fontSize: 7 },
        styles: { fontSize: 6, cellPadding: 1 },
      });
    }

    // Results and Analysis
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [
        [
          "6. DESCRIPCIÓN DE RESULTADOS ESTADÍSTICOS (COMPARACIÓN CON OBJETIVOS)",
        ],
      ],
      body: [[stat.statisticalResultsDescription || "-"]],
      theme: "grid",
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      styles: { fontSize: 8, cellPadding: 3 },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 5,
      head: [["7. ANÁLISIS DE LAS CAUSAS QUE ORIGINARON LAS DESVIACIONES"]],
      body: [[stat.deviationsCausesAnalysis || "-"]],
      theme: "grid",
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      styles: { fontSize: 8, cellPadding: 3 },
    });

    // Ficha Técnica
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [
        ["FICHA TÉCNICA DEL FORMATO DE DATOS PARA EL INFORME ESTADÍSTICO"],
      ],
      body: [
        [
          "1. ÍNDICE DE FRECUENCIA (IF): Número de accidentes incapacitantes por cada millón de horas hombre trabajadas.",
        ],
        [
          "   Fórmula: IF = (N° Accidentes Incapacitantes x 1'000,000) / Horas Hombre Trabajadas",
        ],
        [
          "2. ÍNDICE DE GRAVEDAD (IS): Número de días perdidos por cada millón de horas hombre trabajadas.",
        ],
        [
          "   Fórmula: IS = (N° Días Perdidos x 1'000,000) / Horas Hombre Trabajadas",
        ],
        [
          "3. ÍNDICE DE ACCIDENTABILIDAD (IA): Relación entre el índice de frecuencia y el índice de gravedad.",
        ],
        ["   Fórmula: IA = (IF x IS) / 1,000"],
        [
          "4. TASA DE INCIDENCIA (TI): Número de enfermedades ocupacionales por cada mil trabajadores expuestos.",
        ],
        [
          "   Fórmula: TI = (N° Enfermedades Ocupacionales x 1,000) / N° Trabajadores Expuestos",
        ],
      ],
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fontStyle: "bold", textColor: [0, 0, 0] },
    });
  } else if (lr.type === "audit") {
    const audit = lr as any;
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [[{ content: "2. Datos de la Auditoría", colSpan: 2 }]],
      body: [
        ["Nombre del Auditor(es)", audit.auditorName || "-"],
        ["N° Registro del Auditor", audit.auditorRegistrationNumber || "-"],
        ["Fecha Inicio", audit.auditStartDate || "-"],
        ["Fecha Fin", audit.auditEndDate || "-"],
        ["Alcance de la Auditoría", audit.auditScope || "-"],
        ["Procesos Auditados", audit.auditedProcesses || "-"],
        [
          "Responsables de los Procesos Auditados",
          audit.auditedProcessesResponsible || "-",
        ],
        [
          "N° de No Conformidades",
          (audit.nonConformitiesCount || 0).toString(),
        ],
        ["Conclusiones de la Auditoría", audit.auditConclusions || "-"],
      ],
      theme: "grid",
      headStyles: { fillColor: brand },
    });
  }

  if (lr.correctiveMeasures && lr.correctiveMeasures.length > 0) {
    const isAudit = lr.type === "audit";
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [
        isAudit
          ? [
              "No Conformidad",
              "Causas",
              "Medida Correctiva",
              "Responsable",
              "Fecha",
              "Estado",
            ]
          : ["Medidas Correctivas", "Responsable", "Fecha", "Estado"],
      ],
      body: lr.correctiveMeasures.map((m) =>
        isAudit
          ? [
              m.description || "-",
              (m as any).causes || "-",
              (m as any).measure || "-",
              m.responsible || "-",
              `${m.executionDay}/${m.executionMonth}/${m.executionYear}`,
              (m.status || "").toUpperCase(),
            ]
          : [
              m.description || "-",
              m.responsible || "-",
              `${m.executionDay}/${m.executionMonth}/${m.executionYear}`,
              (m.status || "").toUpperCase(),
            ],
      ),
      theme: "grid",
      headStyles: { fillColor: brand, fontSize: isAudit ? 8 : 10 },
      styles: { fontSize: isAudit ? 7 : 9 },
    });
  }

  if (lr.responsibles && lr.responsibles.length > 0) {
    const signatureCache: Record<string, string> = {};
    for (const r of lr.responsibles) {
      if (r.signatureUrl && !signatureCache[r.signatureUrl]) {
        try {
          signatureCache[r.signatureUrl] = await getNormalizedPdfImage(r.signatureUrl, 420, 216);
        } catch (e) {
          console.error("Failed to load responsible signature", e);
        }
      }
    }

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Responsables del Registro", "Cargo", "Fecha", "Firma"]],
      body: lr.responsibles.map((r) => [r.name, r.position, r.date, ""]),
      theme: "grid",
      headStyles: { fillColor: brand },
      styles: { minCellHeight: 20, valign: "middle" },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const resp = lr.responsibles![data.row.index];
          if (resp.signatureUrl && signatureCache[resp.signatureUrl]) {
            try {
              doc.addImage(
                signatureCache[resp.signatureUrl],
                "PNG",
                data.cell.x + 2,
                data.cell.y + 2,
                data.cell.width - 4,
                data.cell.height - 8,
              );
              if (resp.signedByEmail) {
                doc.setFontSize(6);
                doc.setTextColor(100);
                doc.text(
                  resp.signedByEmail,
                  data.cell.x + 2,
                  data.cell.y + data.cell.height - 2,
                );
              }
            } catch (e) {
              console.error("Error adding signature to PDF:", e);
            }
          } else {
            doc.setDrawColor(200);
            doc.line(
              data.cell.x + 5,
              data.cell.y + data.cell.height - 5,
              data.cell.x + data.cell.width - 5,
              data.cell.y + data.cell.height - 5,
            );
          }
        }
      },
    });
  }
};

/**
 * Generate PDF for a single Legal Register
 */
export const generateLegalRegisterPDF = async (lr: any) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  await addLegalRegisterToDoc(doc, lr);
  addFooter(doc);
  doc.save(`Registro_Legal_${lr.type}_${lr.registerNumber}.pdf`);
};

/**
 * Generate PDF for a completed Inspection
 */
export const generateInspectionPDF = async (inspection: Inspection) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  let y = addHeader(doc, "REGISTRO DE INSPECCIÓN", inspection.templateTitle);
  const when = inspection.createdAt?.toDate ? inspection.createdAt.toDate() : null;

  y = addInfoTable(doc, y, "Información general", [
    ["Inspección", inspection.templateTitle],
    ["Equipo / área", inspection.equipmentName || "-"],
    ["Inspector", inspection.workerName],
    ["DNI del inspector", inspection.workerDni || "No registrado"],
    ["Fecha de realización", when ? format(when, "dd/MM/yyyy HH:mm") : "N/A"],
    ["Resultado general", inspection.hasIssues ? "CON OBSERVACIONES" : "SATISFACTORIO"],
    ["Estado", inspection.status === "pending_review" ? "PENDIENTE DE REVISIÓN" : "REVISADO"],
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Pregunta / ítem", "Respuesta", "Estado", "Comentario"]],
    body: inspection.results.map((r) => [
      r.question,
      typeof r.answer === "boolean" ? (r.answer ? "SÍ" : "NO") : String(r.answer ?? "-"),
      r.isIssue ? "OBSERVACIÓN" : "OK",
      r.comment || "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 26, halign: "center", fontStyle: "bold" },
      3: { cellWidth: "auto" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        data.cell.styles.textColor = data.cell.raw === "OK" ? [16, 150, 100] : [220, 38, 38];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const attachments = inspection.attachmentUrls || [];
  if (attachments.length > 0) {
    y = addSection(doc, y, "Evidencia / documentos adjuntos", attachments.map((a) =>
      `${a.type === "video" ? "Video" : "Imagen"}: ${a.url.startsWith("data:") ? "adjunto en la app" : a.url}`,
    ));
    const photos = attachments.filter((a) => a.type === "image").map((a) => a.url);
    if (photos.length > 0) y = await addPhotoGrid(doc, y, photos);
  }

  const withPhotos = inspection.results.filter((r) => r.photoUrl || (r.photos && r.photos.length > 0));
  if (withPhotos.length > 0) {
    y = addSubtitle(doc, y, "Anexo: evidencias fotográficas");
    for (const item of withPhotos) {
      const urls = [
        ...(item.photoUrl && !item.photos ? [item.photoUrl] : []),
        ...((item.photos || []).map((p: any) => p.url)),
      ];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      y = writeWrapped(doc, item.question, layout.left, ensureSpace(doc, y, 50), layout.contentWidth, 4.8) + 1;
      doc.setFont("helvetica", "normal");
      y = await addPhotoGrid(doc, y, urls);
    }
  }

  const dateText = when ? when.toLocaleString() : new Date().toLocaleString();
  let workerSig: string | null = inspection.signatureBase64 || null;
  if (!workerSig && inspection.signatureUrl) {
    try {
      workerSig = await getNormalizedPdfImage(inspection.signatureUrl, 420, 216);
    } catch (e) {
      console.error("Error fetching signature URL:", e);
    }
  }
  let supervisorSig: string | null = null;
  if (inspection.supervisorSignatureUrl) {
    try {
      supervisorSig = await getNormalizedPdfImage(inspection.supervisorSignatureUrl, 420, 216);
    } catch (e) {
      console.error("Error drawing supervisor sig", e);
    }
  }
  addSignatureRow(doc, y + 6, [
    { title: "Inspector / trabajador", image: workerSig, name: inspection.workerName, dni: inspection.workerDni, date: dateText },
    { title: "Supervisor SST", image: supervisorSig, name: inspection.supervisorName || "Pendiente de firma", dni: inspection.supervisorDni, date: dateText },
  ]);

  addFooter(doc);
  doc.save(
    `Inspeccion_${inspection.templateTitle.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`,
  );
};

/**
 * Generate PDF for Training Completion
 */
export const generateTrainingCertificatePDF = async (
  training: Training,
  completion: TrainingCompletion,
) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc({ orientation: "landscape" });
  const { brandRgb } = getLayout(doc);
  const W = 297;
  const cx = W / 2;
  const maxW = 230;

  // Marco con el color de la empresa
  doc.setDrawColor(...brandRgb);
  doc.setLineWidth(2);
  doc.rect(10, 10, 277, 190);
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.5);
  doc.rect(13, 13, 271, 184);

  // Logo de la empresa
  const logo = await loadCompanyLogo();
  let y = 24;
  if (logo) {
    const h = 16;
    const w = Math.min(h * logo.ratio, 90);
    doc.addImage(logo.data, "PNG", cx - w / 2, y, w, w / logo.ratio);
    y += w / logo.ratio + 12;
  } else {
    y += 10;
  }

  // Escribe centrado y achica la letra hasta que entre en el máximo de líneas
  const centered = (text: string, size: number, minSize: number, maxLines: number, bold: boolean, lineGap = 1.15) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    let fs = size;
    let lines: string[];
    do {
      doc.setFontSize(fs);
      lines = doc.splitTextToSize(text, maxW) as string[];
      fs -= 1;
    } while (lines.length > maxLines && fs >= minSize);
    const lh = (fs + 1) * 0.3528 * lineGap;
    lines.forEach((line, i) => doc.text(line, cx, y + i * lh, { align: "center" }));
    y += lines.length * lh;
  };

  doc.setTextColor(...brandRgb);
  centered("CERTIFICADO", 36, 28, 1, true);
  y += 1;
  centered("DE CAPACITACIÓN", 18, 14, 1, true);
  y += 9;

  doc.setTextColor(60, 60, 60);
  centered("Se otorga el presente reconocimiento a:", 14, 12, 1, false);
  y += 5;
  doc.setTextColor(20, 20, 20);
  centered((completion.userName || "Trabajador").toUpperCase(), 26, 16, 2, true);
  if (completion.userDni) {
    y += 1;
    doc.setTextColor(90, 90, 90);
    centered(`DNI ${completion.userDni}`, 11, 10, 1, false);
  }
  y += 6;
  doc.setTextColor(60, 60, 60);
  centered("Por haber completado satisfactoriamente la capacitación:", 14, 12, 1, false);
  y += 4;
  doc.setTextColor(...brandRgb);
  centered(`"${training.title}"`, 18, 12, 3, true);

  const dateStr = completion.completedAt?.toDate
    ? format(completion.completedAt.toDate(), "eeee d 'de' MMMM 'de' yyyy", { locale: es })
    : format(new Date(), "eeee d 'de' MMMM 'de' yyyy", { locale: es });
  y = Math.max(y + 8, 160);
  doc.setTextColor(60, 60, 60);
  centered(`Otorgado el ${dateStr}`, 12, 10, 1, false);

  // Pie: empresa
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(getCurrentCompanyName() || "Seguridad y Salud en el Trabajo", cx, 190, { align: "center" });
  doc.setTextColor(0, 0, 0);

  doc.save(`Certificado_${(completion.userName || "Trabajador").replace(/\s+/g, "_")}.pdf`);
};

export const generateInductionPDF = async (induction: Induction, INDUCTION_SECTIONS: any[], companyName: string, companyRuc: string) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  let y = addHeader(doc, "REGISTRO DE INDUCCIÓN, CAPACITACIÓN, ENTRENAMIENTO Y SIMULACROS DE EMERGENCIA");

  y = addInfoTable(doc, y, "Datos de la inducción", [
    ["Razón social", companyName],
    ["RUC", companyRuc],
    ["Trabajador", induction.workerName],
    ["DNI", induction.workerDni],
    ["Cargo", induction.workerPosition || "-"],
    ["Impartida por", induction.trainerName || "-"],
    ["Fecha", induction.date ? new Date(induction.date + "T00:00:00").toLocaleDateString() : "-"],
  ]);

  if (induction.checklist && induction.checklist.length > 0) {
    const tableBody: any[] = [];
    INDUCTION_SECTIONS.forEach((section) => {
      tableBody.push([{ content: section.title, colSpan: 6, styles: { fillColor: [243, 243, 246], fontStyle: "bold", textColor: [0, 0, 0] } }]);
      section.items.forEach((item: any) => {
        const checkItem = induction.checklist.find((c) => c.id === item.id);
        tableBody.push([
          item.number,
          item.topic,
          checkItem?.status === "si" ? "X" : "",
          checkItem?.status === "no" ? "X" : "",
          checkItem?.status === "na" ? "X" : "",
          checkItem?.observations || "",
        ]);
      });
    });
    autoTable(doc, {
      startY: y,
      head: [["N°", "Tema / contenido", "Sí", "No", "N/A", "Observaciones"]],
      body: tableBody,
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb, textColor: 255 },
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 82 },
        2: { cellWidth: 9, halign: "center" },
        3: { cellWidth: 9, halign: "center" },
        4: { cellWidth: 10, halign: "center" },
        5: { cellWidth: "auto" },
      },
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [["Temas de inducción legal", "Evaluado / entregado"]],
      body: [
        ["Entrega de Reglamento Interno (RISST)", induction.receivedRisst ? "SÍ" : "NO"],
        ["Capacitación en IPERC Base y Controles", induction.receivedIperc ? "SÍ" : "NO"],
        ["Entendimiento del Mapa de Riesgos", induction.receivedMap ? "SÍ" : "NO"],
        ["Difusión de la Política de SST", induction.receivedPolicy ? "SÍ" : "NO"],
        ["Plan de Respuesta ante Emergencias", induction.receivedEmergencyPlan ? "SÍ" : "NO"],
      ],
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb, textColor: 255 },
      styles: { fontSize: 9.5, cellPadding: 3 },
      columnStyles: { 1: { cellWidth: 45, halign: "center" } },
    });
  }
  y = (doc as any).lastAutoTable.finalY + 10;

  const dateText = induction.createdAt?.toDate ? induction.createdAt.toDate().toLocaleString() : undefined;
  const load = async (url?: string | null) => {
    if (!url) return null;
    try {
      return await getNormalizedPdfImage(url, 420, 216);
    } catch (e) {
      return null;
    }
  };
  addSignatureRow(doc, y, [
    { title: "Trabajador", image: await load(induction.workerSignatureUrl || induction.signatureBase64), name: induction.workerName, dni: induction.workerDni, date: dateText },
    { title: "Responsable de la inducción", image: await load(induction.supervisorSignatureUrl), name: induction.supervisorName || induction.trainerName || "", dni: induction.supervisorDni, date: dateText },
  ]);

  addFooter(doc);
  doc.save(`Induccion_${induction.workerName.replace(/\s+/g, "_")}.pdf`);
};


export const generateCommitteeActPdf = async (
  meeting: any,
  users: any[],
  committeeMembers: any[],
  companyName: string
) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  const meetingDate = meeting.date ? new Date(meeting.date) : new Date();
  const longDate = format(meetingDate, "dd 'de' MMMM 'de' yyyy", { locale: es });
  const title = `ACTA N° ${meeting.meetingNumber || "001"}-${meetingDate.getFullYear()}-CSST`;
  let y = addHeader(doc, title, `Reunión ${String(meeting.type || "").toLowerCase()} · ${companyName}`);

  doc.setFontSize(10);
  const introText = `De acuerdo con lo regulado por la Ley Nº 29783, Ley de Seguridad y Salud en el Trabajo, su Reglamento, aprobado por el Decreto Supremo Nº 005-2012-TR y normativas vigentes; siendo las ${meeting.startTime || "00:00"} hrs. del ${longDate}, se llevó a cabo la reunión del Comité de Seguridad y Salud en el Trabajo (CSST) de la empresa ${companyName}, ${meeting.location ? "en " + meeting.location : "de forma presencial/virtual"}, con las siguientes personas:`;
  y = writeWrapped(doc, introText, layout.left, y, layout.contentWidth, 5) + 4;

  const employerReps = committeeMembers.filter((m) => meeting.employerAttendees?.includes(m.id));
  const workerReps = committeeMembers.filter((m) => meeting.workerAttendees?.includes(m.id));

  // Actas antiguas: asistentes guardados como usuarios
  if (employerReps.length === 0 && workerReps.length === 0 && meeting.attendees) {
    const adminRoles = ["employer", "supervisor", "super_admin", "gerencia"];
    const legacyEmployer = users.filter((u) => (meeting.employerAttendees ? meeting.employerAttendees.includes(u.uid) : meeting.attendees?.includes(u.uid) && adminRoles.includes(u.role)));
    const legacyWorker = users.filter((u) => (meeting.workerAttendees ? meeting.workerAttendees.includes(u.uid) : meeting.attendees?.includes(u.uid) && u.role === "worker"));
    const legacyUnassigned = users.filter((u) => meeting.attendees?.includes(u.uid) && !meeting.employerAttendees && !meeting.workerAttendees && ![...adminRoles, "worker"].includes(u.role));
    legacyWorker.push(...legacyUnassigned);
    legacyEmployer.forEach((u) => employerReps.push({ name: u.displayName || u.email, role: "Miembro Titular", dni: u.dni || "" }));
    legacyWorker.forEach((u) => workerReps.push({ name: u.displayName || u.email, role: "Miembro Titular", dni: u.dni || "" }));
  }

  y = addSubtitle(doc, y, "I. INTEGRANTES");
  const memberRows = (reps: any[]) =>
    reps.length === 0
      ? [[{ content: "No se registraron", colSpan: 5, styles: { halign: "center", textColor: [120, 120, 120] } }]]
      : reps.map((rep, i) => [i + 1, rep.name || "-", rep.position || "Sin cargo", rep.role || "Miembro Titular", rep.dni || "-"]);
  autoTable(doc, {
    startY: y,
    head: [["N°", "Nombre", "Cargo", "Condición", "DNI"]],
    body: [
      [{ content: "Representantes del empleador", colSpan: 5, styles: { fillColor: [243, 243, 246], fontStyle: "bold" } }],
      ...memberRows(employerReps),
      [{ content: "Representantes de los trabajadores", colSpan: 5, styles: { fillColor: [243, 243, 246], fontStyle: "bold" } }],
      ...memberRows(workerReps),
    ],
    theme: "grid",
    headStyles: { fillColor: layout.brandRgb },
    styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
    columnStyles: { 0: { cellWidth: 10, halign: "center" }, 4: { cellWidth: 24 } },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  y = addSection(doc, y, "II. AGENDA", meeting.agenda || "No se registraron puntos de agenda.");
  y = addSection(doc, y, "III. DESARROLLO DE LA REUNIÓN", meeting.development || "No se registraron detalles del desarrollo.");

  y = addSubtitle(doc, y, "IV. ACUERDOS");
  if (!meeting.agreements || meeting.agreements.length === 0) {
    y = writeWrapped(doc, "No se registraron acuerdos en esta reunión.", layout.left, y, layout.contentWidth, 4.8) + 4;
  } else {
    autoTable(doc, {
      startY: y,
      head: [["N°", "Acuerdo", "Responsable", "Fecha límite"]],
      body: meeting.agreements.map((agr: any, i: number) => [
        i + 1,
        agr.task || "-",
        agr.responsibleName || "No asignado",
        agr.deadline ? format(new Date(agr.deadline), "dd/MM/yyyy") : "No definida",
      ]),
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb },
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 10, halign: "center" }, 2: { cellWidth: 40 }, 3: { cellWidth: 24 } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  y = addSection(doc, y, "V. ANEXOS", meeting.anexos || "No se registraron anexos.");

  const closeText = `Siendo las ${meeting.endTime || "00:00"} horas, del ${longDate}, se da por concluida la reunión, firmando los asistentes en señal de conformidad.`;
  y = writeWrapped(doc, closeText, layout.left, ensureSpace(doc, y, 15), layout.contentWidth, 5) + 10;

  // Firmas manuales de los asistentes, de dos en dos
  const attendees = [...employerReps, ...workerReps];
  for (let i = 0; i < attendees.length; i += 2) {
    y = addSignatureRow(
      doc,
      y,
      attendees.slice(i, i + 2).map((a) => ({ title: a.role || "Miembro Titular", image: null, name: a.name, dni: a.dni })),
    );
  }

  addFooter(doc);
  doc.save(`Acta_CSST_${meeting.meetingNumber || "001"}.pdf`);
};

export const generateDrillReportPDF = async (drill: any, companyName: string) => {
  try {
    await ensureLetterheadLoaded();
    const doc = createLetterheadDoc();
    const layout = getLayout(doc);
    const drillDate = drill.date && drill.date.toDate ? drill.date.toDate() : new Date(drill.date);
    let y = addHeader(doc, "ACTA E INFORME DE SIMULACRO", companyName);

    y = addInfoTable(doc, y, "1. Datos del simulacro", [
      ["Título", drill.title || "-"],
      ["Tipo de evento", drill.type || "-"],
      ["Fecha y hora", isNaN(drillDate.getTime()) ? "-" : `${drillDate.toLocaleDateString("es-PE")} ${drillDate.toLocaleTimeString("es-PE")}`],
      ["Tiempo de evacuación", drill.evacuationTimeSeconds != null ? `${drill.evacuationTimeSeconds} segundos` : "-"],
      ["N° de participantes", drill.participantsCount != null ? String(drill.participantsCount) : "-"],
    ]);

    y = addSection(doc, y, "2. Evaluación y observaciones", drill.evaluation || "Sin observaciones.");

    if (drill.photos && drill.photos.length > 0) {
      y = addSubtitle(doc, y, "3. Evidencias adjuntas");
      autoTable(doc, {
        startY: y,
        head: [["#", "Nombre del archivo", "Enlace"]],
        body: drill.photos.map((photo: any, index: number) => {
          let url = photo.url || "";
          if (url.startsWith("data:")) url = "[Imagen adjunta]";
          else if (url.length > 150) url = url.substring(0, 147) + "...";
          return [String(index + 1), photo.name || `Evidencia ${index + 1}`, url];
        }),
        theme: "grid",
        headStyles: { fillColor: layout.brandRgb },
        styles: { fontSize: 8, overflow: "linebreak", cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 50 } },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    addSignatureRow(doc, y + 6, [
      { title: "Rescatista / Brigadista", image: null },
      { title: "Responsable de SST", image: null },
    ]);

    addFooter(doc);
    doc.save(`Informe_Simulacro_${(drill.title || "simulacro").replace(/\s+/g, "_")}.pdf`);
  } catch (error) {
    console.error("Error generating Drill PDF:", error);
    throw error;
  }
};

export const generateManagementMeetingPDF = async (meeting: any, agreements: any[], companyName: string) => {
  await ensureLetterheadLoaded();
  const doc = createLetterheadDoc();
  const layout = getLayout(doc);
  let y = addHeader(doc, "ACTA DE REUNIÓN DE GERENCIA", companyName);

  y = addInfoTable(doc, y, "1. Datos generales", [
    ["Título", meeting.title || "-"],
    ["Fecha", meeting.date || "-"],
    ["Estado", meeting.status === "approved" ? "Aprobada" : meeting.status === "conducted" ? "Realizada" : "Programada"],
    ["Asistentes", meeting.attendees || "-"],
  ]);

  if (meeting.objective) y = addSection(doc, y, "2. Objetivo de la reunión", meeting.objective);
  if (meeting.keyPoints) y = addSection(doc, y, "3. Puntos clave tratados", meeting.keyPoints);
  if (meeting.decisions) y = addSection(doc, y, "4. Decisiones tomadas", meeting.decisions);

  y = addSubtitle(doc, y, "5. Acuerdos y seguimiento");
  if (agreements.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Descripción del acuerdo", "Fecha límite", "Estado", "Aprobado por Gcia."]],
      body: agreements.map((a) => [
        a.description || "-",
        a.deadline || "-",
        a.status === "completed" ? "Completado" : a.status === "in_progress" ? "En proceso" : "Pendiente",
        a.managerApproved ? "Sí" : "No",
      ]),
      theme: "grid",
      headStyles: { fillColor: layout.brandRgb },
      styles: { fontSize: 8.5, cellPadding: 2, overflow: "linebreak" },
      columnStyles: { 1: { cellWidth: 26 }, 2: { cellWidth: 26 }, 3: { cellWidth: 28, halign: "center" } },
    });
    y = (doc as any).lastAutoTable.finalY + 12;
  } else {
    y = writeWrapped(doc, "No se registraron acuerdos en esta reunión.", layout.left, y, layout.contentWidth, 4.8) + 12;
  }

  const load = async (url?: string | null) => {
    if (!url) return null;
    try {
      return await getNormalizedPdfImage(url, 420, 216);
    } catch (e) {
      return null;
    }
  };
  addSignatureRow(doc, y, [
    { title: "Gerencia General", image: await load(meeting.gerenciaSignature), name: meeting.gerenciaSignerName, dni: meeting.gerenciaSignerDni },
    { title: "Responsable SST", image: await load(meeting.sstSignature), name: meeting.sstSignerName, dni: meeting.sstSignerDni },
  ]);

  addFooter(doc);
  return URL.createObjectURL(doc.output("blob"));
};
