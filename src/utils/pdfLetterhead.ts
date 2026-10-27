import { jsPDF, jsPDFOptions } from "jspdf";
import { format } from "date-fns";
import { Company } from "../types";
import { CompanyKey, resolveBrand } from "./brand";

// Hojas membretadas oficiales (public/membretes, A4 a 150 ppp). top/bottom marcan,
// en mm, el espacio libre entre el membrete de arriba y el de abajo.
const LETTERHEADS: Record<CompanyKey, { src: string; top: number; bottom: number }> = {
  ih: { src: "/membretes/image-health.jpg", top: 34, bottom: 262 },
  cc: { src: "/membretes/cc-laboratorios.jpg", top: 37, bottom: 254 },
  pf: { src: "/membretes/poder-fenix-lab.jpg", top: 46, bottom: 268 },
};

export const PAGE_MARGIN_X = 18;

export interface PdfLayout {
  top: number;
  bottom: number;
  left: number;
  right: number;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  // Color principal de la empresa, para títulos y encabezados de tabla
  brandRgb: [number, number, number];
}

let currentKey: CompanyKey = "ih";
let currentCompanyName = "";
let currentLogoSrc = "/logos/image-health.png";
const logoCache: Record<string, { data: string; ratio: number }> = {};
let currentBrandRgb: [number, number, number] = [134, 16, 121];
const imageCache: Partial<Record<CompanyKey, string>> = {};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const loadImage = async (key: CompanyKey) => {
  if (imageCache[key]) return;
  try {
    const res = await fetch(LETTERHEADS[key].src);
    const blob = await res.blob();
    imageCache[key] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("No se pudo cargar la hoja membretada:", error);
  }
};

// La llama CompanyContext al cambiar de empresa: precarga su hoja membretada
// para que los PDF (incluso los que se generan sin esperar) ya la tengan.
export const setLetterheadCompany = (company?: Company | null) => {
  const brand = resolveBrand(company);
  currentKey = brand.key;
  currentBrandRgb = hexToRgb(brand.main);
  currentCompanyName = company?.businessName || "";
  currentLogoSrc = brand.logo;
  void loadImage(currentKey);
};

// Por si un PDF se genera antes de que termine la precarga
export const ensureLetterheadLoaded = () => loadImage(currentKey);

export const getLayout = (doc: jsPDF): PdfLayout => {
  const stored = (doc as any).__layout as PdfLayout | undefined;
  if (stored) return stored;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return {
    top: 20,
    bottom: pageHeight - 20,
    left: PAGE_MARGIN_X,
    right: pageWidth - PAGE_MARGIN_X,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - PAGE_MARGIN_X * 2,
    brandRgb: currentBrandRgb,
  };
};

// Crea el documento con la hoja membretada de la empresa actual en cada página.
// Los documentos horizontales (certificados) no llevan membrete.
export const createLetterheadDoc = (options?: jsPDFOptions): jsPDF => {
  const doc = new jsPDF(options);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const portrait = pageHeight > pageWidth;
  const letterhead = LETTERHEADS[currentKey];
  const image = portrait ? imageCache[currentKey] : undefined;

  const layout: PdfLayout = {
    top: image ? letterhead.top : 20,
    bottom: image ? letterhead.bottom : pageHeight - 20,
    left: PAGE_MARGIN_X,
    right: pageWidth - PAGE_MARGIN_X,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - PAGE_MARGIN_X * 2,
    brandRgb: currentBrandRgb,
  };
  (doc as any).__layout = layout;

  // Las tablas que pasan de página respetan el membrete
  (doc as any).__autoTableDocumentDefaults = {
    rowPageBreak: "avoid",
    margin: {
      top: layout.top,
      bottom: pageHeight - layout.bottom,
      left: layout.left,
      right: PAGE_MARGIN_X,
    },
  };

  if (image) {
    const draw = () => doc.addImage(image, "JPEG", 0, 0, pageWidth, pageHeight, "membrete", "FAST");
    draw();
    (doc as any).internal.events.subscribe("addPage", draw);
  }
  return doc;
};

// Si lo que viene no cabe antes del membrete de abajo, pasa a la siguiente página.
export const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  const layout = getLayout(doc);
  if (y + needed > layout.bottom) {
    doc.addPage();
    return layout.top;
  }
  return y;
};

// Escribe un texto que baja de renglón dentro del ancho dado y pasa de página si
// hace falta. Devuelve la posición siguiente.
export const writeWrapped = (
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = 5,
): number => {
  const lines = doc.splitTextToSize(text || "", maxWidth) as string[];
  let cursor = y;
  for (const line of lines) {
    cursor = ensureSpace(doc, cursor, lineHeight);
    doc.text(line, x, cursor);
    cursor += lineHeight;
  }
  return cursor;
};

// Título del documento al inicio del espacio libre. Devuelve la posición siguiente.
export const drawDocTitle = (doc: jsPDF, title: string, subtitle?: string): number => {
  const layout = getLayout(doc);
  let y = layout.top + 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...layout.brandRgb);
  const titleLines = doc.splitTextToSize(title, layout.contentWidth) as string[];
  doc.text(titleLines, layout.pageWidth / 2, y, { align: "center" });
  y += titleLines.length * 6;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(90, 90, 90);
    const subLines = doc.splitTextToSize(subtitle, layout.contentWidth) as string[];
    doc.text(subLines, layout.pageWidth / 2, y, { align: "center" });
    y += subLines.length * 4.5;
  }
  doc.setDrawColor(...layout.brandRgb);
  doc.setLineWidth(0.4);
  doc.line(layout.left, y, layout.right, y);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return y + 6;
};

// Pie de cada página, entre el contenido y el membrete de abajo:
// fecha de generación a la izquierda y "Página X de Y" a la derecha.
export const addPageNumbers = (doc: jsPDF) => {
  const layout = getLayout(doc);
  const pages = doc.getNumberOfPages();
  const generated = `Generado el ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    const y = Math.min(layout.bottom + 5, layout.pageHeight - 6);
    doc.text(generated, layout.left, y);
    doc.text(`Página ${i} de ${pages}`, layout.right, y, { align: "right" });
  }
  doc.setTextColor(0, 0, 0);
};

export const getCurrentCompanyName = () => currentCompanyName;

// Logo a color de la empresa actual (para documentos sin membrete, como certificados)
export const loadCompanyLogo = async (): Promise<{ data: string; ratio: number } | null> => {
  if (logoCache[currentLogoSrc]) return logoCache[currentLogoSrc];
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentLogoSrc;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    logoCache[currentLogoSrc] = { data: canvas.toDataURL("image/png"), ratio: img.naturalWidth / img.naturalHeight };
    return logoCache[currentLogoSrc];
  } catch (error) {
    console.error("No se pudo cargar el logo:", error);
    return null;
  }
};
