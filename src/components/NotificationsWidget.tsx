import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { useCompany } from "../CompanyContext";
import { Notification } from "../types";
import { Loader2, Bell, CheckCircle, Trash2, X, Shield, BookOpen, Stethoscope, AlertTriangle, Check, Eye, Mail, Inbox } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { ConfirmationModal } from "./ui/ConfirmationModal";

const getNotificationStyles = (title: string, message: string) => {
  const t = `${title || ""} ${message || ""}`.toLowerCase();
  if (t.includes("epp") || t.includes("equipo") || t.includes("entrega")) {
    return {
      icon: Shield,
      bg: "bg-blue-50 text-blue-600 border border-blue-100",
      indicator: "bg-blue-500",
    };
  }
  if (
    t.includes("inducción") ||
    t.includes("charla") ||
    t.includes("capacitación") ||
    t.includes("entrenamiento") ||
    t.includes("documento") ||
    t.includes("firma")
  ) {
    return {
      icon: BookOpen,
      bg: "bg-emerald-50 text-emerald-600 border border-emerald-100",
      indicator: "bg-emerald-500",
    };
  }
  if (
    t.includes("médico") ||
    t.includes("examen") ||
    t.includes("descanso") ||
    t.includes("salud") ||
    t.includes("clínic")
  ) {
    return {
      icon: Stethoscope,
      bg: "bg-rose-50 text-rose-600 border border-rose-100",
      indicator: "bg-rose-500",
    };
  }
  if (
    t.includes("alerta") ||
    t.includes("urgente") ||
    t.includes("peligro") ||
    t.includes("incidente") ||
    t.includes("advertencia")
  ) {
    return {
      icon: AlertTriangle,
      bg: "bg-amber-50 text-amber-600 border border-amber-100",
      indicator: "bg-amber-500",
    };
  }
  return {
    icon: Bell,
    bg: "bg-slate-50 text-slate-500 border border-slate-100",
    indicator: "bg-slate-400",
  };
};

// Las publicaciones del Muro antiguas enlazan a "/", que ahora es el Inicio
const notificationTarget = (link: string) => (link === "/" ? "/muro" : link);

export const NotificationsWidget: React.FC = () => {
  const { profile } = useAuth();
  const { companies, setSelectedCompanyRuc } = useCompany();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"unread" | "read">("unread");
  const [notificationToDelete, setNotificationToDelete] = useState<
    string | null
  >(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const navigate = useNavigate();
  const [toastNotifications, setToastNotifications] = useState<Notification[]>(
    [],
  );

  useEffect(() => {
    if (!profile || !profile.uid) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", profile.uid),
    );

    
    let isFirstSnapshot = true;
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!isFirstSnapshot) {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data() as Notification;
              // Avoid showing toast for notifications the user just created themselves
              if (!snapshot.metadata.hasPendingWrites && !data.read) {
                const newToast = { id: change.doc.id, ...data };
                setToastNotifications((prev) => [...prev, newToast]);
                try {
                  const audio = new Audio("/notification-sound.mp3");
                  audio.play().catch(() => {});
                } catch (e) {}
                setTimeout(() => {
                  setToastNotifications((prev) =>
                    prev.filter((t) => t.id !== newToast.id),
                  );
                }, 8000);
              }
            }
          });
        }
        isFirstSnapshot = false;

        const fetchedNotifications = snapshot.docs.map(

          (doc) => ({ id: doc.id, ...doc.data() }) as Notification,
        );
        fetchedNotifications.sort((a, b) => {
          const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return tB - tA;
        });
        setNotifications(fetchedNotifications);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "notifications");
      },
    );

    return () => unsubscribe();
  }, [profile]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    return n.read;
  });

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleDeleteNotification = (id: string) => {
    setNotificationToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteNotification = async () => {
    if (!notificationToDelete) return;
    try {
      await deleteDoc(doc(db, "notifications", notificationToDelete));
      import("react-hot-toast").then((toast) => toast.default.success("Notificación eliminada"));
      setNotificationToDelete(null);
    } catch (error) {
      console.error("Error deleting notification:", error);
      import("react-hot-toast").then((toast) => toast.default.error("Error al eliminar notificación"));
    }
  };

  
  const confirmDeleteAllNotifications = async () => {
    try {
      const deletePromises = notifications.map(n => deleteDoc(doc(db, "notifications", n.id!)));
      await Promise.all(deletePromises);
      import("react-hot-toast").then((toast) => toast.default.success("Todas las notificaciones han sido eliminadas"));
      setIsDeleteAllModalOpen(false);
    } catch (error) {
      console.error("Error deleting all notifications:", error);
      import("react-hot-toast").then((toast) => toast.default.error("Error al eliminar las notificaciones"));
    }
  };

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      if (n.id) await handleMarkAsRead(n.id);
    }
  };

  return (
    <>
      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col gap-3">
        {toastNotifications.map((toast) => (
          <div
            key={toast.id}
            onClick={() => {
               if (toast.link) {
                 navigate(notificationTarget(toast.link));
                 if (toast.companyRuc) {
                    setSelectedCompanyRuc(toast.companyRuc);
                 }
                 setToastNotifications(prev => prev.filter(t => t.id !== toast.id));
                 handleMarkAsRead(toast.id!);
               }
            }}
            className="bg-white border border-slate-200 shadow-xl rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm w-full cursor-pointer hover:bg-slate-50 transition-colors"
          >
            <div className="bg-sky-100 p-2 rounded-lg shrink-0">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {toast.title}
              </p>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() =>
                setToastNotifications((prev) =>
                  prev.filter((t) => t.id !== toast.id),
                )
              }
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            ></div>
            <div className="absolute right-0 mt-3 w-[340px] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              
              <div className="p-4 border-b border-slate-50 flex flex-wrap gap-2 justify-between items-center bg-white">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-base">Notificaciones</h3>
                  {unreadCount > 0 && (
                    <span className="bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {unreadCount} nuevas
                    </span>
                  )}
                </div>
                <div className="flex gap-3 items-center">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors"
                    >
                      Marcar todo leído
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={() => setIsDeleteAllModalOpen(true)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Borrar todo
                    </button>
                  )}
                </div>
              </div>

              {/* Segmented control tabs */}
              <div className="p-2 bg-slate-50 border-b border-slate-100 flex gap-1">
                <button
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filter === "unread"
                      ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                  }`}
                  onClick={() => setFilter("unread")}
                >
                  No leídas ({unreadCount})
                </button>
                <button
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filter === "read"
                      ? "bg-white text-slate-800 shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                  }`}
                  onClick={() => setFilter("read")}
                >
                  Leídas ({notifications.length - unreadCount})
                </button>
              </div>

              {/* Notification list */}
              <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50 bg-white">
                {filteredNotifications.length === 0 ? (
                  <div className="p-10 text-center flex flex-col items-center justify-center">
                    <div className="bg-slate-50 p-4 rounded-full mb-3 text-slate-400">
                      <Inbox className="w-8 h-8 stroke-[1.25]" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {filter === "unread" ? "Todo al día" : "Sin notificaciones leídas"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                      {filter === "unread"
                        ? "No tienes notificaciones pendientes por revisar."
                        : "Aquí aparecerán las notificaciones que ya has revisado."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredNotifications.map((notification) => {
                      const styles = getNotificationStyles(notification.title || "", notification.message || "");
                      const NotificationIcon = styles.icon;

                      return (
                        <div
                          key={notification.id}
                          className={`p-4 transition-all duration-150 relative hover:bg-slate-50/70 cursor-pointer ${
                            !notification.read ? "bg-blue-50/15" : ""
                          }`}
                          onClick={() => {
                            if (!notification.read) {
                              handleMarkAsRead(notification.id!);
                            }
                            if (notification.link) {
                              navigate(notificationTarget(notification.link));
                              if (notification.companyRuc) {
                                setSelectedCompanyRuc(notification.companyRuc);
                              }
                              setIsOpen(false);
                            }
                          }}
                        >
                          <div className="flex gap-3">
                            {/* Icon Container */}
                            <div className={`p-2.5 rounded-xl shrink-0 h-10 w-10 flex items-center justify-center ${styles.bg}`}>
                              <NotificationIcon className="w-5 h-5" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className={`text-sm ${!notification.read ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                                  {notification.title}
                                </h4>
                                {!notification.read && (
                                  <span className="w-2 h-2 rounded-full bg-blue-600 inline-block shrink-0" />
                                )}
                              </div>
                              
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                {notification.message}
                              </p>

                              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                {notification.companyRuc && (
                                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100/50 px-2 py-0.5 rounded-md">
                                    {companies.find((c) => c.ruc === notification.companyRuc)?.businessName || "Empresa"}
                                  </span>
                                )}

                                {notification.link && (
                                  <Link
                                    to={notificationTarget(notification.link)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!notification.read) {
                                        handleMarkAsRead(notification.id!);
                                      }
                                      if (notification.companyRuc) {
                                        setSelectedCompanyRuc(notification.companyRuc);
                                      }
                                      setIsOpen(false);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors inline-flex items-center gap-0.5"
                                  >
                                    Ver detalles &rarr;
                                  </Link>
                                )}
                              </div>
                            </div>

                            {/* Delete button */}
                            <div className="shrink-0 self-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNotification(notification.id!);
                                }}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => {
            setIsDeleteModalOpen(false);
            setNotificationToDelete(null);
          }}
          onConfirm={confirmDeleteNotification}
          title="Eliminar Notificación"
          message="¿Estás seguro de que deseas eliminar esta notificación? Esta acción no se puede deshacer."
        />
        <ConfirmationModal
          isOpen={isDeleteAllModalOpen}
          onClose={() => setIsDeleteAllModalOpen(false)}
          onConfirm={confirmDeleteAllNotifications}
          title="Eliminar Todas las Notificaciones"
          message="¿Estás seguro de que deseas eliminar TODAS las notificaciones? Esta acción vaciará toda tu bandeja y no se puede deshacer."
        />
      </div>
    </>
  );
};
