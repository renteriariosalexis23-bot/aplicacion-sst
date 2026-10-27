import { writeBatch, doc as firestoreDoc, 
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { MAIN_ADMIN_EMAIL } from "../constants/admin";

export const deleteNotificationsByTarget = async (targetId: string) => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("targetId", "==", targetId)
    );
    const snapshot = await getDocs(q);
    const batches = [];
    let currentBatch = writeBatch(db);
    let opCount = 0;

    snapshot.docs.forEach((d) => {
      if (opCount === 490) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        opCount = 0;
      }
      currentBatch.delete(d.ref);
      opCount++;
    });

    if (opCount > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
  } catch (error) {
    console.error("Error deleting notifications by targetId:", error);
  }
};

export const notifyUser = async (
  userId: string,
  title: string,
  message: string,
  link?: string,
  companyRuc?: string,
  targetId?: string,
) => {
  try {
    await addDoc(collection(db, "notifications"), {
      userId,
      ...(companyRuc && { companyRuc }),
      title,
      message,
      read: false,
      ...(link && { link }),
      ...(targetId && { targetId }),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error sending notification to user:", error);
  }
};

export const notifyAllWorkers = async (
  title: string,
  message: string,
  link?: string,
  companyRuc?: string,
  targetId?: string,
) => {
  try {
    
    let q;
    if (companyRuc && companyRuc !== "ALL") {
      q = query(
        collection(db, "users"),
        where("companyRuc", "==", companyRuc),
      );
    } else {
      q = query(collection(db, "users"));
    }
    const snapshot = await getDocs(q);

    // Filter in-memory to safely catch workers/supervisors and avoid Firestore compound index requirements
    const targetWorkers = snapshot.docs.filter((d) => {
      const data = d.data() as any;
      const role = data.role || "worker";
      return role !== "employer" && role !== "super_admin" && role !== "gerencia";
    });

    console.log(`Sending to ${targetWorkers.length} workers.`);
    
    const batches = [];
    let currentBatch = writeBatch(db);
    let opCount = 0;

    targetWorkers.forEach((d) => {
      if (opCount === 490) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        opCount = 0;
      }
      const data = d.data() as any;
      const workerId = data.uid || d.id;
      const newNotifRef = firestoreDoc(collection(db, "notifications"));
      currentBatch.set(newNotifRef, {
        userId: workerId,
        ...(companyRuc && { companyRuc }),
        title,
        message,
        read: false,
        ...(link && { link }),
        ...(targetId && { targetId }),
        createdAt: serverTimestamp(),
      });
      opCount++;
    });

    if (opCount > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
  } catch (error) {
    console.error("Error sending notifications:", error);
    throw error;
  }
};

export const notifyAllEmployers = async (
  title: string,
  message: string,
  link?: string,
  companyRuc?: string,
  targetId?: string,
) => {
  try {
    
    const usersToNotify: { id: string }[] = [];

    // Always fetch super_admins
    const superAdminQ = query(
      collection(db, "users"),
      where("role", "==", "super_admin"),
    );
    const saSnap = await getDocs(superAdminQ);
    saSnap.docs.forEach((d) => {
      const data = d.data() as any;
      usersToNotify.push({ id: data.uid || d.id });
    });

    // Fetch hardcoded admin
    const mainAdminQ = query(
      collection(db, "users"),
      where("email", "==", MAIN_ADMIN_EMAIL),
    );
    const maSnap = await getDocs(mainAdminQ);
    maSnap.docs.forEach((d) => {
      const data = d.data() as any;
      usersToNotify.push({ id: data.uid || d.id });
    });

    // Fetch employers for the company
    let empQ;
    if (companyRuc && companyRuc !== "ALL") {
      empQ = query(
        collection(db, "users"),
        where("companyRuc", "==", companyRuc),
      );
    } else {
      empQ = query(collection(db, "users"));
    }
    const empSnap = await getDocs(empQ);
    empSnap.docs.forEach((d) => {
      const data = d.data() as any;
      const role = data.role;
      if (role === "employer" || role === "super_admin" || role === "supervisor" || role === "gerencia") {
        usersToNotify.push({ id: data.uid || d.id });
      }
    });

    const uniqueUsers = Array.from(new Set(usersToNotify.map((u) => u.id))).filter(Boolean);

    const batches = [];
    let currentBatch = writeBatch(db);
    let opCount = 0;

    uniqueUsers.forEach((adminId) => {
      if (opCount === 490) {
        batches.push(currentBatch.commit());
        currentBatch = writeBatch(db);
        opCount = 0;
      }
      const newNotifRef = firestoreDoc(collection(db, "notifications"));
      currentBatch.set(newNotifRef, {
        userId: adminId,
        ...(companyRuc && { companyRuc }),
        title,
        message,
        read: false,
        ...(link && { link }),
        ...(targetId && { targetId }),
        createdAt: serverTimestamp(),
      });
      opCount++;
    });

    if (opCount > 0) {
      batches.push(currentBatch.commit());
    }

    await Promise.all(batches);
  } catch (error) {
    console.error("Error sending notifications to admins:", error);
  }
};
