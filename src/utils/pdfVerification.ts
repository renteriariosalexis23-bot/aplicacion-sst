import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// Cada PDF que genera la app queda registrado en "pdf_verifications". El PDF lleva un
// código QR con la dirección /verificar/<código>: quien lo escanee ve, sin iniciar sesión,
// qué documento es, de qué empresa, quiénes figuran y quién lo generó.

export interface VerificationPerson {
  role: string;
  name?: string;
  dni?: string;
}

export interface VerificationInfo {
  kind: string; // Tipo de documento, p. ej. "Acta de entrega de EPP"
  title?: string; // Detalle, p. ej. el nombre de la capacitación
  people?: VerificationPerson[];
}

export interface PdfVerification {
  id: string;
  url: string;
  qr: string; // PNG en base64
}

export const verificationUrl = (id: string) => `${window.location.origin}/verificar/${id}`;

// En la página pública solo se muestran los 3 últimos dígitos del DNI
export const maskDni = (dni?: string) => {
  const clean = (dni || "").trim();
  if (!clean) return "";
  return clean.length <= 3 ? clean : "•".repeat(clean.length - 3) + clean.slice(-3);
};

const clip = (text: string | undefined, max: number) => (text || "").trim().slice(0, max);

const qrPng = (value: string): Promise<string> =>
  new Promise((resolve, reject) => {
    let svg = renderToStaticMarkup(
      createElement(QRCodeSVG, { value, size: 256, level: "M", marginSize: 1, bgColor: "#ffffff", fgColor: "#000000" }),
    );
    // Para abrirse como imagen, el SVG necesita declarar su formato
    if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(img, 0, 0, 256, 256);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

/**
 * Registra el PDF y devuelve su código QR. Si no se puede registrar (sin conexión o sin
 * sesión), devuelve null y el PDF sale sin QR: nunca se imprime un código que no verifique.
 */
export const registerPdf = async (
  info: VerificationInfo,
  company: { name: string; ruc: string },
  issuerName: string,
): Promise<PdfVerification | null> => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const ref = doc(collection(db, "pdf_verifications"));
    await withTimeout(
      setDoc(ref, {
        kind: clip(info.kind, 150),
        title: clip(info.title, 300),
        companyName: clip(company.name, 200),
        companyRuc: clip(company.ruc, 20),
        people: (info.people || [])
          .filter((p) => p.name)
          .slice(0, 20)
          .map((p) => ({ role: clip(p.role, 80), name: clip(p.name, 150), dni: maskDni(p.dni) })),
        issuedAt: serverTimestamp(),
        issuedBy: uid,
        issuedByName: issuerName,
      }),
      8000,
    );
    const url = verificationUrl(ref.id);
    return { id: ref.id, url, qr: await qrPng(url) };
  } catch (error) {
    console.warn("No se pudo registrar el PDF para verificación; se genera sin código QR.", error);
    return null;
  }
};
