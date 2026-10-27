import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export const sendNotification = async (
  userId: string,
  title: string,
  message: string,
  link: string,
  companyRuc: string,
) => {
  try {
    await addDoc(collection(db, "notifications"), {
      userId,
      title,
      message,
      link,
      companyRuc,
      read: false,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};
