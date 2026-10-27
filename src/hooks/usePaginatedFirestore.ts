import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { collection, query, getDocs, limit, startAfter, QueryConstraint, DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function usePaginatedFirestore<T>(
  queryKey: any[],
  collectionName: string,
  baseConstraints: QueryConstraint[],
  pageSize: number = 10,
  enabled: boolean = true
) {
  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      let q = query(collection(db, collectionName), ...baseConstraints, limit(pageSize));
      if (pageParam) {
        q = query(collection(db, collectionName), ...baseConstraints, startAfter(pageParam), limit(pageSize));
      }
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as T));
      const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
      return { docs, lastVisible };
    },
    initialPageParam: null as QueryDocumentSnapshot<DocumentData> | null,
    getNextPageParam: (lastPage) => lastPage.lastVisible,
    enabled,
  });
}
