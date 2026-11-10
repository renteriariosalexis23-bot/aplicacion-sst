import { get, set } from "idb-keyval";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { uploadToCloudinary } from "./cloudinary";
import { Inspection, PreUseInspection } from "../types";
import { markEquipmentInspected } from "./equipmentStatus";
import { notifyAllEmployers } from "./notifications";

const PENDING_INSPECTIONS_KEY = "pending_inspections";
const PENDING_PREUSE_KEY = "pending_preuse";

export interface PendingInspection {
  id: string;
  inspection: any; // The raw data before upload
  timestamp: number;
}

export const savePendingInspection = async (inspectionData: any) => {
  const pending =
    (await get<PendingInspection[]>(PENDING_INSPECTIONS_KEY)) || [];
  pending.push({
    id: Date.now().toString(),
    inspection: inspectionData,
    timestamp: Date.now(),
  });
  await set(PENDING_INSPECTIONS_KEY, pending);
};

export const getPendingInspections = async (): Promise<PendingInspection[]> => {
  return (await get<PendingInspection[]>(PENDING_INSPECTIONS_KEY)) || [];
};

export const removePendingInspection = async (id: string) => {
  const pending =
    (await get<PendingInspection[]>(PENDING_INSPECTIONS_KEY)) || [];
  await set(
    PENDING_INSPECTIONS_KEY,
    pending.filter((p) => p.id !== id),
  );
};

export const savePendingPreUse = async (preUseData: any) => {
  const pending = (await get<PendingInspection[]>(PENDING_PREUSE_KEY)) || [];
  pending.push({
    id: Date.now().toString(),
    inspection: preUseData, // We reuse the same structure
    timestamp: Date.now(),
  });
  await set(PENDING_PREUSE_KEY, pending);
};

export const getPendingPreUses = async (): Promise<PendingInspection[]> => {
  return (await get<PendingInspection[]>(PENDING_PREUSE_KEY)) || [];
};

export const removePendingPreUse = async (id: string) => {
  const pending = (await get<PendingInspection[]>(PENDING_PREUSE_KEY)) || [];
  await set(
    PENDING_PREUSE_KEY,
    pending.filter((p) => p.id !== id),
  );
};

export const syncPendingInspections = async () => {
  if (!navigator.onLine) return;

  const pendingInsp = await getPendingInspections();
  if (pendingInsp.length > 0) {
    console.log(`Syncing ${pendingInsp.length} pending inspections...`);
    for (const item of pendingInsp) {
      try {
        const data = item.inspection;
        const signatureUrl = await uploadToCloudinary(data.signatureBase64);

        for (const result of data.results) {
          if (result.photoFile) {
            result.photoUrl = await uploadToCloudinary(result.photoFile);
            delete result.photoFile;
          }
          if (result.photoFiles && result.photoFiles.length > 0) {
            const uploadedPhotos = [];
            for (const file of result.photoFiles) {
              const url = await uploadToCloudinary(file);
              uploadedPhotos.push({
                url,
                name: file.name,
                type: file.type.startsWith("image/") ? "image" : "video",
              });
            }
            result.photos = uploadedPhotos;
            delete result.photoFiles;
          }
        }

        let attachmentUrls = [];
        if (data.generalPhotoFiles && data.generalPhotoFiles.length > 0) {
          for (const file of data.generalPhotoFiles) {
            const url = await uploadToCloudinary(file);
            attachmentUrls.push({
              url,
              name: file.name,
              type: file.type.startsWith("image/") ? "image" : "video",
            });
          }
        }

        const finalInspection: Omit<Inspection, "id"> = {
          templateId: data.templateId,
          templateTitle: data.templateTitle,
          workerId: data.workerId,
          workerName: data.workerName,
          workerDni: data.workerDni,
          workerEmail: data.workerEmail,
          companyRuc: data.companyRuc || "",
          results: data.results,
          signatureUrl,
          signatureBase64: data.signatureBase64,
          hasIssues: data.hasIssues,
          status: "pending_review",
          createdAt: Timestamp.fromMillis(item.timestamp),
        };
        
        if (attachmentUrls.length > 0) {
          finalInspection.attachmentUrls = attachmentUrls;
        }

        if (data.equipmentId) finalInspection.equipmentId = data.equipmentId;
        if (data.equipmentName)
          finalInspection.equipmentName = data.equipmentName;

        await addDoc(collection(db, "inspections"), finalInspection);
        await removePendingInspection(item.id);
        await markEquipmentInspected(data.equipmentId, !!data.hasIssues, data.workerName, new Date(item.timestamp));
        const issueCount = (data.results || []).filter((r: any) => r.isIssue).length;
        await notifyAllEmployers(
          data.hasIssues ? `Alerta: inspección con ${issueCount} ${issueCount === 1 ? "observación" : "observaciones"}` : "Nueva Inspección Completada",
          `${data.workerName} ${data.hasIssues ? `marcó ${issueCount} ${issueCount === 1 ? "punto" : "puntos"} con problemas en` : "completó"} la inspección: ${[data.templateTitle, data.equipmentName].filter(Boolean).join(" · ")} (hecha sin internet, subida ahora).`,
          "/inspections",
          data.companyRuc,
        );
        console.log(`Successfully synced inspection ${item.id}`);
      } catch (error) {
        console.error(`Failed to sync inspection ${item.id}:`, error);
      }
    }
  }

  const pendingPreUse = await getPendingPreUses();
  if (pendingPreUse.length > 0) {
    console.log(
      `Syncing ${pendingPreUse.length} pending pre-use checklists...`,
    );
    for (const item of pendingPreUse) {
      try {
        const data = item.inspection;
        const signatureUrl = await uploadToCloudinary(data.signatureBase64);

        let attachmentUrls = [];
        if (data.generalPhotoFiles && data.generalPhotoFiles.length > 0) {
          for (const file of data.generalPhotoFiles) {
            const url = await uploadToCloudinary(file);
            attachmentUrls.push({
              url,
              name: file.name,
              type: file.type.startsWith("image/") ? "image" : "video",
            });
          }
        }

        const finalPreUse: Omit<PreUseInspection, "id"> = {
          companyRuc: data.companyRuc,
          equipmentId: data.equipmentId,
          equipmentName: data.equipmentName,
          equipmentCode: data.equipmentCode,
          workerUid: data.workerUid,
          workerName: data.workerName,
          workerDni: data.workerDni,
          date: Timestamp.fromMillis(item.timestamp),
          items: data.items,
          isOperative: data.isOperative,
          signature: signatureUrl,
        };

        if (attachmentUrls.length > 0) {
          finalPreUse.attachmentUrls = attachmentUrls;
        }

        // Note: we can't do the cascade corrective action sync easily here because that logic is mostly in the component,
        // but we'll flag it so perhaps cloud functions could do it or just skip for offline.

        await addDoc(collection(db, "preuse_inspections"), finalPreUse);
        await removePendingPreUse(item.id);
        const badItems = (data.items || []).filter((i: any) => !i.isOk).length;
        await markEquipmentInspected(data.equipmentId, badItems > 0, data.workerName, new Date(item.timestamp));
        await notifyAllEmployers(
          !data.isOperative ? "Alerta: equipo inoperativo" : badItems > 0 ? `Alerta: pre-uso con ${badItems} ${badItems === 1 ? "observación" : "observaciones"}` : "Checklist Pre-Uso Registrado",
          `${data.workerName} registró el pre-uso de ${data.equipmentName}${!data.isOperative ? " y lo marcó como INOPERATIVO" : badItems > 0 ? ` con ${badItems} ${badItems === 1 ? "punto" : "puntos"} con problemas` : ". Todo conforme"} (hecho sin internet, subido ahora).`,
          "/preuse",
          data.companyRuc,
        );
        console.log(`Successfully synced pre-use ${item.id}`);
      } catch (error) {
        console.error(`Failed to sync pre-use ${item.id}:`, error);
      }
    }
  }
};
