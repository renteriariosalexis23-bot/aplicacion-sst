import { collection, doc, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { differenceInCalendarDays, format } from "date-fns";
import { db } from "../firebase";
import { Equipment } from "../types";

// Cada cuántos días debe inspeccionarse un equipo, y con cuántos días de anticipación
// se avisa de un vencimiento (extintor, prueba hidrostática).
export const INSPECTION_EVERY_DAYS = 30;
export const EXPIRY_WARNING_DAYS = 30;

export interface EquipmentAlert {
  id: string;
  title: string;
  label: string;
}

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = typeof value === "string" ? new Date(value + (value.length === 10 ? "T00:00:00" : "")) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** Anota en el equipo su última inspección (inspección con plantilla o checklist de pre-uso). */
export const markEquipmentInspected = async (
  equipmentId: string | undefined,
  hasIssues: boolean,
  byName: string,
  at?: Date, // Para inspecciones hechas sin internet y subidas después
) => {
  if (!equipmentId) return;
  try {
    await updateDoc(doc(db, "equipment", equipmentId), {
      lastInspectionAt: at ? Timestamp.fromDate(at) : serverTimestamp(),
      lastInspectionHasIssues: hasIssues,
      lastInspectionBy: byName || "",
    });
  } catch (error) {
    console.warn("No se pudo anotar la última inspección del equipo:", error);
  }
};

/**
 * Equipos registrados antes de que existiera "lastInspectionAt": busca una sola vez su
 * última inspección en el historial y la anota (null si nunca se inspeccionó).
 */
export const backfillLastInspection = async (equipment: Equipment & { id: string }) => {
  try {
    const [insp, preuse] = await Promise.all([
      getDocs(query(collection(db, "inspections"), where("equipmentId", "==", equipment.id))),
      getDocs(query(collection(db, "preuse_inspections"), where("equipmentId", "==", equipment.id))),
    ]);
    let latest: Date | null = null;
    insp.forEach((d) => {
      const at = toDate(d.data().createdAt);
      if (at && (!latest || at > latest)) latest = at;
    });
    preuse.forEach((d) => {
      const at = toDate(d.data().date);
      if (at && (!latest || at > latest)) latest = at;
    });
    await updateDoc(doc(db, "equipment", equipment.id), {
      lastInspectionAt: latest ? Timestamp.fromDate(latest) : null,
    });
  } catch (error) {
    console.warn("No se pudo revisar el historial del equipo:", error);
  }
};

/** Lo que requiere atención en cada equipo: inoperativo, sin inspección reciente o por vencer. */
export const equipmentAlerts = (equipments: (Equipment & { id: string })[], now = new Date()): EquipmentAlert[] => {
  const alerts: EquipmentAlert[] = [];
  for (const eq of equipments) {
    const name = [eq.name, eq.codigoInterno || eq.code].filter(Boolean).join(" · ");

    if (eq.status === "inoperative") {
      alerts.push({ id: `${eq.id}-inop`, title: name, label: "Equipo inoperativo: reparar o reemplazar" });
    }

    const last = toDate((eq as any).lastInspectionAt);
    const created = toDate(eq.createdAt);
    if ("lastInspectionAt" in eq) {
      if (last) {
        const days = differenceInCalendarDays(now, last);
        if (days > INSPECTION_EVERY_DAYS) {
          alerts.push({ id: `${eq.id}-late`, title: name, label: `Sin inspección hace ${days} días` });
        }
      } else if (!created || differenceInCalendarDays(now, created) > INSPECTION_EVERY_DAYS) {
        alerts.push({ id: `${eq.id}-never`, title: name, label: "Nunca se ha inspeccionado" });
      }
    }

    const dates: [string, any][] = [
      ["Vencimiento", eq.expirationDate],
      ["Prueba hidrostática", eq.hydrostaticTestDate],
    ];
    for (const [what, value] of dates) {
      const date = toDate(value);
      if (!date) continue;
      const days = differenceInCalendarDays(date, now);
      if (days < 0) {
        alerts.push({ id: `${eq.id}-${what}`, title: name, label: `${what}: venció el ${format(date, "dd/MM/yyyy")}` });
      } else if (days <= EXPIRY_WARNING_DAYS) {
        alerts.push({
          id: `${eq.id}-${what}`,
          title: name,
          label: `${what}: ${days === 0 ? "vence hoy" : `vence el ${format(date, "dd/MM/yyyy")}`}`,
        });
      }
    }
  }
  return alerts;
};
