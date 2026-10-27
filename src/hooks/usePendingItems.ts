import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";

export interface PendingItem {
  id: string;
  title: string;
}

export interface PendingItems {
  docsToSign: PendingItem[];
  examsToSign: PendingItem[];
  trainingsToComplete: PendingItem[];
  inspectionsToReview: number;
  reportsToReview: number;
}

const EMPTY: PendingItems = {
  docsToSign: [],
  examsToSign: [],
  trainingsToComplete: [],
  inspectionsToReview: 0,
  reportsToReview: 0,
};

const matchesArea = (target: string | undefined, userArea: string | undefined) => {
  const area = target || "Todas";
  return area === "Todas" || area.toLowerCase() === (userArea || "").toLowerCase();
};

// Pendientes del usuario para el Inicio: lo que debe firmar o completar y,
// para administradores, lo que espera su revisión.
export const usePendingItems = (): PendingItems => {
  const { profile } = useAuth();
  const { selectedCompany } = useCompany();
  const [items, setItems] = useState<PendingItems>(EMPTY);

  useEffect(() => {
    setItems(EMPTY);
    if (!profile) return;
    const companyRuc = selectedCompany?.ruc || profile.companyRuc;
    if (!companyRuc) return;

    const role = profile.role || "worker";
    const takesTrainings = role === "worker" || role === "supervisor";
    const reviewsInspections = ["employer", "supervisor", "super_admin", "gerencia"].includes(role);
    const reviewsReports = ["employer", "super_admin", "gerencia"].includes(role);
    const set = (patch: Partial<PendingItems>) => setItems((prev) => ({ ...prev, ...patch }));
    const onError = (what: string) => (error: unknown) =>
      console.error(`Error fetching pending ${what}:`, error);

    const unsubs = [
      onSnapshot(
        query(collection(db, "documents"), where("companyRuc", "in", [companyRuc, "ALL"])),
        (snapshot) =>
          set({
            docsToSign: snapshot.docs
              .map((d) => ({ id: d.id, ...(d.data() as any) }))
              .filter(
                (d) =>
                  d.requiresSignature &&
                  matchesArea(d.targetArea, profile.department) &&
                  !d.signatures?.some((sig: any) => sig.userId === profile.uid),
              )
              .map((d) => ({ id: d.id, title: d.title })),
          }),
        onError("documents"),
      ),
      onSnapshot(
        query(
          collection(db, "medicalExams"),
          where("workerId", "==", profile.uid),
          where("status", "==", "pending_signature"),
        ),
        (snapshot) =>
          set({
            examsToSign: snapshot.docs.map((d) => ({
              id: d.id,
              title: `Examen del ${(d.data() as any).examDate || "—"}`,
            })),
          }),
        onError("medical exams"),
      ),
    ];

    if (takesTrainings) {
      unsubs.push(
        onSnapshot(
          query(collection(db, "trainings"), where("companyRuc", "in", [companyRuc, "ALL"])),
          (snapshot) =>
            set({
              trainingsToComplete: snapshot.docs
                .map((d) => ({ id: d.id, ...(d.data() as any) }))
                .filter(
                  (t) =>
                    matchesArea(t.targetArea, profile.department) &&
                    !t.completedBy?.includes(profile.uid),
                )
                .map((t) => ({ id: t.id, title: t.title })),
            }),
          onError("trainings"),
        ),
      );
    }

    if (reviewsInspections) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "inspections"),
            where("companyRuc", "==", companyRuc),
            where("status", "==", "pending_review"),
          ),
          (snapshot) => set({ inspectionsToReview: snapshot.size }),
          onError("inspections"),
        ),
      );
    }

    if (reviewsReports) {
      unsubs.push(
        onSnapshot(
          query(
            collection(db, "reports"),
            where("companyRuc", "==", companyRuc),
            where("status", "==", "pending"),
          ),
          (snapshot) => set({ reportsToReview: snapshot.size }),
          onError("reports"),
        ),
      );
    }

    return () => unsubs.forEach((unsub) => unsub());
  }, [profile, selectedCompany?.ruc]);

  return items;
};
