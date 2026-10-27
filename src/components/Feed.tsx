import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Post, PostType, ReactionType, Company } from "../types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ConfirmationModal } from "./ui/ConfirmationModal";
import toast from "react-hot-toast";
import { Loader2, Trash2,
  Plus,
  ThumbsUp,
  Heart,
  ThumbsDown,
  Paperclip,
  X,
  Image as ImageIcon,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  Eye,
  CheckCircle2, } from "lucide-react";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { notifyAllWorkers } from "../utils/notifications";
import { uploadToCloudinary } from "../utils/cloudinary";
import { ImageModal } from "./ui/ImageModal";

const ExpandableText: React.FC<{ text: string; limit?: number }> = ({
  text,
  limit = 300,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldCollapse = text.length > limit;

  if (!shouldCollapse)
    return <p className="whitespace-pre-wrap text-slate-700">{text}</p>;

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap text-slate-700">
        {isExpanded ? text : `${text.substring(0, limit)}...`}
      </p>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-sky-600 hover:text-blue-800 text-sm font-semibold transition-colors flex items-center gap-1"
      >
        {isExpanded ? (
          <>
            Ver menos <ChevronUp className="w-4 h-4" />
          </>
        ) : (
          <>
            Ver más <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
};

import { PageHeader } from "./ui/PageHeader";
import { Newspaper } from "lucide-react";

export const Feed: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { companies, selectedCompany } = useCompany();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Record<string, any>>({});

  // Pending Actions States
  const [pendingDocs, setPendingDocs] = useState<any[]>([]);
  const [pendingExams, setPendingExams] = useState<any[]>([]);

  // Create Post State
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<PostType>("news");
  const [postToCompanyRuc, setPostToCompanyRuc] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [readReceiptsPost, setReadReceiptsPost] = useState<Post | null>(null);

  // Comments State
  const [activeCommentPost, setActiveCommentPost] = useState<string | null>(
    null,
  );
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    if (isCreating && selectedCompany && !postToCompanyRuc) {
      setPostToCompanyRuc(selectedCompany.ruc);
    }
  }, [isCreating, selectedCompany, postToCompanyRuc]);

  useEffect(() => {
    const targetRuc = selectedCompany?.ruc || profile?.companyRuc;
    if (!targetRuc) {
      setLoading(false);
      return;
    }

    // Fetch users for displaying names in read receipts (only for employers and super_admins)
    if (profile?.role === "employer" || profile?.role === "super_admin" || profile?.role === "gerencia") {
      import("firebase/firestore").then(
        ({ getDocs, collection, query, where }) => {
          let usersQuery;
          if (profile?.role === "super_admin" || targetRuc === "ALL") {
            usersQuery = query(collection(db, "users"));
          } else {
            usersQuery = query(
              collection(db, "users"),
              where("companyRuc", "==", targetRuc),
            );
          }
          
          getDocs(usersQuery)
            .then((usersSnapshot) => {
              const usersData: Record<string, any> = {};
              usersSnapshot.docs.forEach((doc) => {
                usersData[doc.id] = doc.data();
              });
              setUsers(usersData);
            })
            .catch((err) => console.error("Error fetching users:", err));
        },
      );
    }

    let q;
    if (targetRuc) {
      q = query(
        collection(db, "posts"),
        where("companyRuc", "in", [targetRuc, "ALL"]),
        orderBy("createdAt", "desc"),
      );
    } else {
      q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc"),
      );
    }

    let isUnsubscribed = false;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const postsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Post[];
        setPosts(postsData);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "posts");
        setLoading(false);
      },
    );

    return () => {
      if (!isUnsubscribed) {
        isUnsubscribed = true;
        try {
          unsubscribe();
        } catch (e) {}
      }
    };
  }, [profile, selectedCompany]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    const companyRuc = selectedCompany?.ruc || profile.companyRuc;
    if (!companyRuc) {
      return;
    }

    // 1. Fetch pending documents that require signature
    const docsQuery = query(
      collection(db, "documents"),
      where("companyRuc", "in", [companyRuc, "ALL"])
    );

    const unsubscribeDocs = onSnapshot(docsQuery, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const unsignedDocs = allDocs.filter((docItem: any) => {
        if (!docItem.requiresSignature) return false;
        
        // Ensure the doc applies to the user's department/area
        const docArea = docItem.targetArea || "Todas";
        const userArea = profile.department || "";
        const matchesArea = docArea === "Todas" || docArea.toLowerCase() === userArea.toLowerCase();
        if (!matchesArea) return false;

        // Check if user has NOT signed yet
        const hasSigned = docItem.signatures?.some((sig: any) => sig.userId === profile.uid);
        return !hasSigned;
      });
      setPendingDocs(unsignedDocs);
    }, (error) => {
      console.error("Error fetching documents for feed dashboard:", error);
    });

    // 2. Fetch pending medical exams for reception signature
    const examsQuery = query(
      collection(db, "medicalExams"),
      where("workerId", "==", profile.uid),
      where("status", "==", "pending_signature")
    );

    const unsubscribeExams = onSnapshot(examsQuery, (snapshot) => {
      const examsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingExams(examsData);
    }, (error) => {
      console.error("Error fetching medical exams for feed dashboard:", error);
    });

    return () => {
      unsubscribeDocs();
      unsubscribeExams();
    };
  }, [profile, selectedCompany]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !profile ||
      (profile.role !== "employer" && profile.role !== "supervisor" && profile.role !== "super_admin" && profile.role !== "gerencia")
    )
      return;
    if (!title.trim() || !content.trim()) {
      setErrorMsg("El título y el contenido son obligatorios.");
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    try {
      let attachmentUrl = "";
      let attachmentName = "";

      if (file) {
        attachmentUrl = await uploadToCloudinary(file);
        attachmentName = file.name;
      }

      await addDoc(collection(db, "posts"), {
        title: title.substring(0, 100),
        content: content.substring(0, 5000),
        authorId: profile.uid,
        authorName: (
          profile.displayName ||
          profile.email ||
          "Usuario Anónimo"
        ).substring(0, 100),
        type,
        companyRuc: postToCompanyRuc,
        reactions: {},
        comments: [],
        readBy: [], // Initialize empty readBy array
        ...(attachmentUrl && { attachmentUrl, attachmentName }),
        createdAt: serverTimestamp(),
      });

      // Send notification to all workers
      let typeLabel = "Nueva Publicación";
      if (type === "news") typeLabel = "Nueva Noticia";
      if (type === "flyer") typeLabel = "Nuevo Flyer";
      if (type === "notice") typeLabel = "Nuevo Aviso";

      await notifyAllWorkers(
        typeLabel,
        `Se ha publicado: ${title}`,
        "/muro",
        postToCompanyRuc,
      );

      toast.success("Publicación creada exitosamente.");
      setTitle("");
      setContent("");
      setType("news");
      setFile(null);
      setErrorMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsCreating(false);
    } catch (error: any) {
      console.error("Error creating post:", error);
      setErrorMsg(
        `Error: ${error.message || "Hubo un error al crear la publicación."}`,
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    if (
      (profile?.role !== "employer" && profile?.role !== "super_admin" && profile?.role !== "gerencia" && profile?.role !== "supervisor")
    )
      return;
    setPostToDelete(postId);
    setIsDeleteModalOpen(true);
  };

  const confirmDeletePost = async () => {
    if (!postToDelete) return;
    try {
      await deleteDoc(doc(db, "posts", postToDelete));
      toast.success("Mensaje eliminado exitosamente.");
      setPostToDelete(null);
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Error al eliminar mensaje.");
    }
  };

  const handleReaction = async (
    postId: string,
    currentReactions: Record<string, ReactionType> = {},
    reactionType: ReactionType,
  ) => {
    if (!profile) return;

    const newReactions = { ...currentReactions };

    if (newReactions[profile.uid] === reactionType) {
      delete newReactions[profile.uid];
    } else {
      newReactions[profile.uid] = reactionType;
    }

    try {
      await updateDoc(doc(db, "posts", postId), {
        reactions: newReactions,
      });
    } catch (error) {
      console.error("Error updating reaction:", error);
    }
  };

  const handleMarkAsRead = async (
    postId: string,
    currentReadBy: string[] = [],
  ) => {
    if (!profile) return;
    if (currentReadBy.includes(profile.uid)) return; // Already read

    try {
      await updateDoc(doc(db, "posts", postId), {
        readBy: [...currentReadBy, profile.uid],
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const handleAddComment = async (
    postId: string,
    currentComments: any[] = [],
  ) => {
    if (!profile || !commentText.trim()) return;

    const newComment = {
      id: Date.now().toString(),
      text: commentText.trim(),
      authorId: profile.uid,
      authorName: profile.displayName || profile.email,
      createdAt: new Date(),
    };

    try {
      await updateDoc(doc(db, "posts", postId), {
        comments: [...currentComments, newComment],
      });
      toast.success("Comentario publicado.");
      setCommentText("");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Error al publicar comentario.");
    }
  };

  const getTypeColor = (type: PostType) => {
    switch (type) {
      case "news":
        return "bg-blue-100 text-blue-800";
      case "flyer":
        return "bg-purple-100 text-purple-800";
      case "notice":
        return "bg-amber-100 text-amber-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeLabel = (type: PostType) => {
    switch (type) {
      case "news":
        return "Noticia";
      case "flyer":
        return "Flyer";
      case "notice":
        return "Aviso";
      default:
        return "Publicación";
    }
  };

  const getReactionCounts = (reactions: Record<string, ReactionType> = {}) => {
    const counts = { like: 0, love: 0, dislike: 0 };
    Object.values(reactions).forEach((r) => {
      if (counts[r] !== undefined) counts[r]++;
    });
    return counts;
  };

  const isImage = (filename?: string) => {
    if (!filename) return false;
    return /\.(jpg|jpeg|png|gif|webp|jfif|svg|bmp)$/i.test(filename);
  };

  const isVideo = (filename?: string) => {
    if (!filename) return false;
    return /\.(mp4|webm|ogg|mov)$/i.test(filename);
  };

  const isAudio = (filename?: string) => {
    if (!filename) return false;
    return /\.(mp3|wav|ogg|m4a|webm)$/i.test(filename);
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Muro de Noticias SST"
        description="Información, noticias y comunicados importantes."
        icon={Newspaper}
        color="sky"
        actions={
          (profile?.role === "employer" ||
            profile?.role === "supervisor" ||
            profile?.role === "super_admin" || profile?.role === "gerencia") &&
            !isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center px-4 py-2 bg-white text-sky-700 rounded-md hover:bg-sky-50 transition-colors shadow-sm font-medium border border-transparent"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nueva Publicación
              </button>
            )
        }
      />

      {/* 📋 Section of Pending Actions and Signatures for Mobile-friendly workflow */}
      {profile && (pendingDocs.length > 0 || pendingExams.length > 0) && (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/35 rounded-2xl p-5 mb-8 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-amber-600 rounded-xl text-white shadow-md shadow-amber-500/15 shrink-0">
              <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-amber-950 uppercase tracking-wide">
                Pendientes de Firma o Acción
              </h2>
              <p className="text-xs text-amber-900/80">
                Tienes compromisos de seguridad SST que requieren tu firma o resolución inmediata.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Documents */}
            {pendingDocs.map(docItem => (
              <div key={docItem.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm flex flex-col justify-between hover:border-amber-300 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase">
                      Documento por Firmar
                    </span>
                    <FileText className="w-5 h-5 text-amber-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">
                    {docItem.title}
                  </h3>
                  {docItem.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {docItem.description}
                    </p>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex">
                  <button
                    onClick={() => navigate("/documents")}
                    className="w-full inline-flex items-center justify-center px-4 py-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-[0.98] cursor-pointer"
                  >
                    Leer y Firmar Documento
                    <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {/* Medical Exams */}
            {pendingExams.map(exam => (
              <div key={exam.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm flex flex-col justify-between hover:border-amber-300 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full uppercase">
                      Confirmación Médica (EMO)
                    </span>
                    <Heart className="w-5 h-5 text-red-500 animate-pulse" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 leading-tight">
                    Constancia de Examen EMO
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    Por favor confirma la recepción de los resultados y recomendaciones de tu examen médico.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex">
                  <button
                    onClick={() => navigate("/medical-exams")}
                    className="w-full inline-flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold transition shadow-sm active:scale-[0.98] cursor-pointer"
                  >
                    Firmar Cargo Médco
                    <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}

          </div>
        </div>
      )}

      {isCreating &&
        (profile?.role === "employer" || profile?.role === "supervisor" || profile?.role === "super_admin" || profile?.role === "gerencia") && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-slate-200">
            <h2 className="text-lg font-semibold mb-4">Crear Publicación</h2>
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreatePost} className="space-y-4">
              {profile?.role === "super_admin" && (
                <div className="flex items-center space-x-2 bg-sky-50 p-3 rounded-lg border border-sky-100">
                  <input
                    type="checkbox"
                    id="global-post"
                    checked={postToCompanyRuc === "ALL"}
                    onChange={(e) => setPostToCompanyRuc(e.target.checked ? "ALL" : (selectedCompany?.ruc || ""))}
                    className="rounded border-sky-300 text-sky-600 focus:ring-sky-500 h-4 w-4"
                  />
                  <label htmlFor="global-post" className="text-sm font-semibold text-sky-900">
                    Publicar para todas las empresas (Global)
                  </label>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as PostType)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                >
                  <option value="news">Noticia</option>
                  <option value="flyer">Flyer</option>
                  <option value="notice">Aviso</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Título
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Título de la publicación"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contenido
                </label>
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                  placeholder="Escribe el contenido aquí..."
                />
              </div>

              {/* File Upload Section */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Adjuntar Archivo (Opcional)
                </label>
                {file ? (
                  <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      {isImage(file.name) ? (
                        <ImageIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Paperclip className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-slate-700 truncate">
                        {file.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-slate-200 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Paperclip className="w-8 h-8 mb-3 text-slate-400" />
                        <p className="mb-2 text-sm text-slate-500">
                          <span className="font-semibold">
                            Haz clic para adjuntar
                          </span>{" "}
                          o arrastra y suelta
                        </p>
                        <p className="text-xs text-slate-500">
                          PDF, Imágenes, Word, Excel (Max. 10MB)
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) =>
                          setFile(e.target.files ? e.target.files[0] : null)
                        }
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Publicando...
                    </>
                  ) : (
                    "Publicar"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

      {loading ? (
        <div className="text-center py-10 text-slate-500">
          Cargando publicaciones...
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-10 text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
          No hay publicaciones aún.
        </div>
      ) : (
        <div className="space-y-6">
          {posts.map((post) => {
            const counts = getReactionCounts(post.reactions);
            const myReaction = profile ? post.reactions?.[profile.uid] : null;

            return (
              <div
                key={post.id}
                className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-200"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-2 ${getTypeColor(post.type)}`}
                      >
                        {getTypeLabel(post.type)}
                      </span>
                      <h2 className="text-xl font-bold text-slate-900">
                        {post.title}
                      </h2>
                      <p className="text-sm text-slate-500 mt-1">
                        Publicado por {post.authorName} •{" "}
                        {post.createdAt
                          ? format(
                              post.createdAt.toDate(),
                              "d 'de' MMMM, yyyy 'a las' HH:mm",
                              { locale: es },
                            )
                          : "Justo ahora"}
                      </p>
                    </div>
                    {(profile?.role === "employer" ||
                      profile?.role === "supervisor" ||
                      profile?.role === "super_admin" || profile?.role === "gerencia") &&
                      (profile.uid === post.authorId ||
                        profile.role === "super_admin") && (
                        <button
                          onClick={() => handleDeletePost(post.id!)}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title="Eliminar publicación"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                  </div>
                  <div className="prose prose-slate max-w-none mb-4">
                    <ExpandableText text={post.content} />
                  </div>

                  {/* Attachment Display */}
                  {post.attachmentUrl && (
                    <div className="mb-6 mt-4">
                      {isImage(post.attachmentName) ? (
                        <div className="rounded-lg overflow-hidden border border-slate-200 bg-black relative group w-full">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedImage(post.attachmentUrl!)
                            }
                            className="flex justify-center cursor-zoom-in w-full"
                          >
                            <img
                              src={post.attachmentUrl}
                              alt={post.attachmentName || "Imagen adjunta"}
                              className="w-full h-auto max-h-[600px] object-contain group-hover:opacity-90 transition-opacity"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <div className="bg-black/50 text-white px-4 py-2 rounded-full flex items-center backdrop-blur-sm">
                                <svg
                                  className="w-5 h-5 mr-2"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                                  />
                                </svg>
                                Clic para ampliar
                              </div>
                            </div>
                          </button>
                        </div>
                      ) : isVideo(post.attachmentName) ? (
                        <div className="rounded-lg overflow-hidden border border-slate-200 bg-black relative group w-full">
                          <video
                            src={post.attachmentUrl}
                            controls
                            className="w-full h-auto max-h-[600px] object-contain"
                          />
                        </div>
                      ) : isAudio(post.attachmentName) ? (
                        <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50 p-4 w-full sm:w-auto inline-block">
                          <div className="flex items-center mb-3">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-full mr-3">
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                                />
                              </svg>
                            </div>
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[250px]">
                              {post.attachmentName || "Audio adjunto"}
                            </span>
                          </div>
                          <audio
                            src={post.attachmentUrl}
                            controls
                            className="w-full sm:w-80 h-10"
                          />
                        </div>
                      ) : (
                        <a
                          href={post.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center p-4 border rounded-xl transition-all group w-full sm:w-auto shadow-sm hover:shadow-md ${
                            post.attachmentName?.toLowerCase().endsWith(".pdf")
                              ? "border-red-200 bg-red-50 hover:bg-red-100/80 hover:border-red-300"
                              : "border-blue-200 bg-blue-50 hover:bg-blue-100/80 hover:border-blue-300"
                          }`}
                        >
                          <div
                            className={`p-3 rounded-lg mr-4 transition-colors ${
                              post.attachmentName
                                ?.toLowerCase()
                                .endsWith(".pdf")
                                ? "bg-red-100 text-red-600 group-hover:bg-red-200"
                                : "bg-blue-100 text-blue-600 group-hover:bg-blue-200"
                            }`}
                          >
                            {post.attachmentName
                              ?.toLowerCase()
                              .endsWith(".pdf") ? (
                              <FileText className="w-6 h-6" />
                            ) : (
                              <Paperclip className="w-6 h-6" />
                            )}
                          </div>
                          <div className="flex flex-col flex-grow mr-4">
                            <span className="text-sm font-bold text-slate-900 line-clamp-1">
                              {post.attachmentName || "Documento adjunto"}
                            </span>
                            <span
                              className={`text-xs font-medium mt-0.5 ${
                                post.attachmentName
                                  ?.toLowerCase()
                                  .endsWith(".pdf")
                                  ? "text-red-600/80"
                                  : "text-blue-600/80"
                              }`}
                            >
                              {post.attachmentName
                                ?.toLowerCase()
                                .endsWith(".pdf")
                                ? "Documento PDF"
                                : "Archivo adjunto"}
                            </span>
                          </div>
                          <div
                            className={`p-2 rounded-full transition-colors ${
                              post.attachmentName
                                ?.toLowerCase()
                                .endsWith(".pdf")
                                ? "bg-white text-red-500 group-hover:bg-red-500 group-hover:text-white"
                                : "bg-white text-blue-500 group-hover:bg-blue-500 group-hover:text-white"
                            }`}
                          >
                            <Download className="w-4 h-4" />
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Read Receipts Section */}
                  <div className="flex items-center justify-between py-3 border-t border-b border-slate-100 mb-4 bg-slate-50/50 -mx-6 px-6">
                    {profile?.role === "worker" ? (
                      <button
                        onClick={() => handleMarkAsRead(post.id!, post.readBy)}
                        disabled={post.readBy?.includes(profile.uid)}
                        className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          post.readBy?.includes(profile.uid)
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                            : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm"
                        }`}
                      >
                        {post.readBy?.includes(profile.uid) ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Enterado
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2 text-slate-400" />
                            Marcar como Enterado
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => setReadReceiptsPost(post)}
                        className="flex items-center text-sm text-slate-600 hover:text-blue-600 transition-colors cursor-pointer p-1.5 -ml-1.5 rounded-lg hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4 mr-2 text-slate-400" />
                        <span className="font-medium">
                          {post.readBy?.length || 0}
                        </span>
                        <span className="ml-1">trabajadores enterados</span>

                        {(post.readBy?.length || 0) > 0 && (
                          <div className="ml-4 flex -space-x-2 overflow-hidden">
                            {post.readBy?.slice(0, 5).map((uid, i) => (
                              <div
                                key={uid}
                                className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700"
                                title={
                                  users[uid]?.displayName ||
                                  users[uid]?.email ||
                                  "Usuario"
                                }
                              >
                                {(
                                  users[uid]?.displayName ||
                                  users[uid]?.email ||
                                  "U"
                                )
                                  .charAt(0)
                                  .toUpperCase()}
                              </div>
                            ))}
                            {(post.readBy?.length || 0) > 5 && (
                              <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                +{(post.readBy?.length || 0) - 5}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Reactions Bar */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={() =>
                        handleReaction(post.id!, post.reactions, "like")
                      }
                      className={`flex items-center space-x-1.5 text-sm font-medium transition-colors ${myReaction === "like" ? "text-blue-600" : "text-slate-500 hover:text-blue-600"}`}
                    >
                      <ThumbsUp
                        className={`w-5 h-5 ${myReaction === "like" ? "fill-current" : ""}`}
                      />
                      <span className="hidden sm:inline">
                        {counts.like > 0 && counts.like} Me gusta
                      </span>
                      <span className="sm:hidden">
                        {counts.like > 0 && counts.like}
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        handleReaction(post.id!, post.reactions, "love")
                      }
                      className={`flex items-center space-x-1.5 text-sm font-medium transition-colors ${myReaction === "love" ? "text-red-500" : "text-slate-500 hover:text-red-500"}`}
                    >
                      <Heart
                        className={`w-5 h-5 ${myReaction === "love" ? "fill-current" : ""}`}
                      />
                      <span className="hidden sm:inline">
                        {counts.love > 0 && counts.love} Me encanta
                      </span>
                      <span className="sm:hidden">
                        {counts.love > 0 && counts.love}
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        handleReaction(post.id!, post.reactions, "dislike")
                      }
                      className={`flex items-center space-x-1.5 text-sm font-medium transition-colors ${myReaction === "dislike" ? "text-orange-500" : "text-slate-500 hover:text-orange-500"}`}
                    >
                      <ThumbsDown
                        className={`w-5 h-5 ${myReaction === "dislike" ? "fill-current" : ""}`}
                      />
                      <span className="hidden sm:inline">
                        {counts.dislike > 0 && counts.dislike} No me gusta
                      </span>
                      <span className="sm:hidden">
                        {counts.dislike > 0 && counts.dislike}
                      </span>
                    </button>

                    <button
                      onClick={() =>
                        setActiveCommentPost(
                          activeCommentPost === post.id ? null : post.id!,
                        )
                      }
                      className="flex items-center space-x-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors ml-auto"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="hidden sm:inline">
                        {post.comments?.length || 0} Comentarios
                      </span>
                      <span className="sm:hidden">
                        {post.comments?.length || 0}
                      </span>
                    </button>
                  </div>

                  {/* Comments Section */}
                  {activeCommentPost === post.id && (
                    <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 p-6">
                      <div className="space-y-4 mb-4">
                        {!post.comments || post.comments.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-2">
                            No hay comentarios aún. ¡Sé el primero!
                          </p>
                        ) : (
                          post.comments.map((comment: any) => (
                            <div key={comment.id} className="flex space-x-3">
                              <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs">
                                {comment.authorName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-baseline mb-1">
                                  <span className="text-sm font-medium text-slate-900">
                                    {comment.authorName}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {comment.createdAt?.toDate
                                      ? format(
                                          comment.createdAt.toDate(),
                                          "d MMM HH:mm",
                                          { locale: es },
                                        )
                                      : "Justo ahora"}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                                  {comment.text}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs">
                          {profile?.displayName?.charAt(0).toUpperCase() ||
                            profile?.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 relative">
                          <input
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === "Enter") {
                                handleAddComment(post.id!, post.comments);
                              }
                            }}
                            placeholder="Escribe un comentario..."
                            className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-full focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                          <button
                            onClick={() =>
                              handleAddComment(post.id!, post.comments)
                            }
                            disabled={!commentText.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {readReceiptsPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Trabajadores enterados</h2>
                <p className="text-sm text-slate-500">{(readReceiptsPost.readBy?.length || 0)} han visto esta publicación</p>
              </div>
              <button
                onClick={() => setReadReceiptsPost(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {(!readReceiptsPost.readBy || readReceiptsPost.readBy.length === 0) ? (
                <div className="text-center py-8 text-slate-500">
                  <Eye className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p>Aún no hay visualizaciones registradas.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {readReceiptsPost.readBy.map(uid => {
                    const user = users[uid];
                    const name = user?.displayName || user?.email || "Usuario desconocido";
                    const initial = name.charAt(0).toUpperCase();
                    
                    return (
                      <div key={uid} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl transition-colors">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">
                            {user?.displayName || "Usuario"}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {user?.email || "Sin email"}
                          </p>
                        </div>
                        {user?.role && (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-md shrink-0 ${
                            user.role === 'employer' ? 'bg-indigo-100 text-indigo-700' :
                            user.role === 'supervisor' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {user.role === 'employer' ? 'Empleador' :
                             user.role === 'supervisor' ? 'Supervisor' : 'Trabajador'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setPostToDelete(null);
        }}
        onConfirm={confirmDeletePost}
        title="Eliminar Publicación"
        message="¿Estás seguro de que deseas eliminar esta publicación del muro? Esta acción no se puede deshacer."
      />

      <ImageModal
        isOpen={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage}
      />
    </div>
  );
};
