import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { collection, query, getDocs, limit, startAfter, QueryConstraint, where, orderBy, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { Inspection, InspectionTemplate } from "../types";

export function useInspections(companyRuc: string | undefined, workerId: string | undefined, role: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["inspections", companyRuc, workerId, role],
    enabled: !!role,
    queryFn: async ({ pageParam }) => {
      let qInspections;
      const baseConstraints: QueryConstraint[] = [];
      if (["employer", "super_admin", "gerencia", "supervisor"].includes(role || "")) {
        if (companyRuc) {
          baseConstraints.push(where("companyRuc", "==", companyRuc));
        }
      } else if (workerId) {
        baseConstraints.push(where("workerId", "==", workerId));
      }
      
      baseConstraints.push(orderBy("createdAt", "desc"));

      let q = query(collection(db, "inspections"), ...baseConstraints, limit(10));
      if (pageParam) {
        q = query(collection(db, "inspections"), ...baseConstraints, startAfter(pageParam), limit(10));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

      return { docs, lastVisible };
    },
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) => lastPage.lastVisible,
  });
}

export function useInspectionTemplates(companyRuc: string | undefined, role: string | undefined) {
  return useQuery({
    queryKey: ["inspection_templates", companyRuc, role],
    enabled: !!role,
    queryFn: async () => {
      // First, get global templates
      const globalQuery = query(
        collection(db, "inspection_templates"),
        where("isGlobal", "==", true),
        orderBy("createdAt", "desc")
      );
      
      const globalSnapshot = await getDocs(globalQuery);
      const globalTemplates = globalSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InspectionTemplate));

      // Then get company-specific templates if companyRuc is provided
      let companyTemplates: InspectionTemplate[] = [];
      if (companyRuc) {
        const companyQuery = query(
          collection(db, "inspection_templates"),
          where("companyRuc", "==", companyRuc),
          where("isGlobal", "==", false),
          orderBy("createdAt", "desc")
        );
        const companySnapshot = await getDocs(companyQuery);
        companyTemplates = companySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InspectionTemplate));
      }
      
      // Some templates might have been created before the isGlobal field existed,
      // and they only have companyRuc. Let's fetch them too.
      let legacyTemplates: InspectionTemplate[] = [];
      if (companyRuc) {
         const legacyQuery = query(
          collection(db, "inspection_templates"),
          where("companyRuc", "==", companyRuc),
          orderBy("createdAt", "desc")
        );
        const legacySnapshot = await getDocs(legacyQuery);
        legacyTemplates = legacySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InspectionTemplate));
      }

      // Combine and remove duplicates
      const allTemplates = [...globalTemplates, ...companyTemplates, ...legacyTemplates];
      const uniqueTemplates = Array.from(new Map(allTemplates.map(item => [item.id, item])).values());
      
      // Sort combined results
      return uniqueTemplates.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
    }
  });
}
