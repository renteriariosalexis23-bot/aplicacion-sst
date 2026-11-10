import { useInfiniteQuery } from "@tanstack/react-query";
import { collection, query, getDocs, limit, startAfter, QueryConstraint, where, orderBy, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { Report } from "../types";

export function useReports(companyRuc: string | undefined, workerId: string | undefined, role: string | undefined) {
  return useInfiniteQuery({
    queryKey: ["reports", companyRuc, workerId, role],
    queryFn: async ({ pageParam }) => {
      let q;
      const baseConstraints: QueryConstraint[] = [];
      if (["employer", "super_admin", "supervisor", "gerencia"].includes(role || "")) {
        if (companyRuc) {
           baseConstraints.push(where("companyRuc", "==", companyRuc));
        }
      } else if (workerId) {
        // El trabajador ve solo sus reportes. Son pocos: se traen todos y se ordenan aquí,
        // así la consulta no necesita un índice compuesto en Firestore.
        const own = await getDocs(query(collection(db, "reports"), where("reportedBy", "==", workerId)));
        const docs = own.docs
          .map((d) => ({ id: d.id, ...(d.data() as object) }) as Report)
          .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        return { docs, lastVisible: null };
      }

      baseConstraints.push(orderBy("createdAt", "desc"));

      q = query(collection(db, "reports"), ...baseConstraints, limit(15));
      if (pageParam) {
        q = query(collection(db, "reports"), ...baseConstraints, startAfter(pageParam), limit(15));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as object) } as Report));
      const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

      return { docs, lastVisible };
    },
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) => lastPage.lastVisible,
  });
}
