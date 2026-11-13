import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { PostType } from "../types";

// El Muro del Inicio es donde se enteran todos: además de lo que escribe el administrador,
// el sistema publica solo cuando pasa algo que el personal debe saber (un documento por firmar,
// una capacitación nueva, una reunión del comité).
export const publishToWall = async (
  author: { uid: string; displayName?: string; email?: string },
  post: { title: string; content: string; companyRuc: string; type?: PostType; link?: string },
) => {
  try {
    await addDoc(collection(db, "posts"), {
      title: post.title.slice(0, 100),
      content: (post.link ? `${post.content}\n\nVer: ${post.link}` : post.content).slice(0, 5000),
      authorId: author.uid,
      authorName: (author.displayName || author.email || "Administración").slice(0, 100),
      type: post.type || "comunicado",
      reactions: {},
      comments: [],
      readBy: [],
      companyRuc: post.companyRuc,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Si no se puede publicar, la acción original sigue valiendo: el muro es un aviso extra
    console.warn("No se pudo publicar en el muro:", error);
  }
};
