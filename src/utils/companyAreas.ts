import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

// Áreas que ya usan las personas de la empresa (sale de sus perfiles).
// Un trabajador no puede leer los perfiles de los demás, así que para él no se consulta:
// sus listas usan solo las áreas que el administrador registró en la empresa.
export const subscribeUserAreas = (
  ruc: string,
  role: string | undefined,
  onAreas: (areas: string[]) => void,
) => {
  if (!ruc || !role || role === "worker") return () => {};
  return onSnapshot(
    query(collection(db, "users"), where("companyRuc", "==", ruc)),
    (snapshot) => {
      const areas = new Set<string>();
      snapshot.forEach((d) => {
        const department = (d.data().department || "").trim();
        if (department) areas.add(department);
      });
      onAreas(Array.from(areas));
    },
    (error) => console.warn("No se pudieron leer las áreas de los usuarios:", error),
  );
};
