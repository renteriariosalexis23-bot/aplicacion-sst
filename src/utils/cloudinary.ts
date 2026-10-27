
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import imageCompression from "browser-image-compression";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const uploadToCloudinary = async (
  file: File | Blob | string,
  resourceType: "auto" | "image" | "video" | "raw" = "auto"
): Promise<string> => {
  try {
    let fileToUpload: Blob | File;
    let fileName = `file_${new Date().getTime()}`;
    
    // If it's already a Data URI, keep it as originalBase64 just in case we need it as a fallback
    let originalBase64: string | null = null;

    // Handle URL string
    if (typeof file === "string" && file.startsWith("http")) {
      return file;
    }

    // Handle base64 string
    if (typeof file === "string" && file.startsWith("data:")) {
      originalBase64 = file;
      const response = await fetch(file);
      fileToUpload = await response.blob();
      const mimeType = file.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1];
      if (mimeType) {
        const ext = mimeType.split("/")[1];
        fileName += `.${ext}`;
      }
    } else if (typeof file === "object" && file !== null && "size" in file && "type" in file) {
      fileToUpload = file as unknown as Blob;
      if ("name" in file) {
        fileName = `${new Date().getTime()}_${(file as any).name}`;
      }
    } else {
      throw new Error("Invalid file type: " + Object.prototype.toString.call(file));
    }

    // Compress image if it's an image type to save space
    if (fileToUpload.type.startsWith("image/")) {
      const options = {
        maxSizeMB: 0.2, // Compresión ligera para mayor velocidad (~200KB max)
        maxWidthOrHeight: 1200, // Mayor resolución, pero rápida de procesar
        useWebWorker: true,
        fileType: "image/webp" as string, // Convertir a WebP para máxima eficiencia
      };
      try {
        const fileForCompression =
          (typeof File !== "undefined" && typeof fileToUpload === "object" && "name" in fileToUpload && "lastModified" in fileToUpload)
            ? (fileToUpload as File)
            : new File([fileToUpload as Blob], fileName, { type: fileToUpload.type });
        fileToUpload = await imageCompression(fileForCompression, options);
      } catch (compressionError) {
        console.warn("Image compression failed, proceeding with original file:", compressionError);
      }
    }

    try {
      // 1. Attempt to upload to Firebase Storage
      const storageRef = ref(storage, `uploads/${fileName}`);
      const snapshot = await uploadBytes(storageRef, fileToUpload);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (storageError: any) {
      console.warn("Firebase Storage failed (possibly quota exceeded). Falling back to Base64:", storageError);
      
      // 2. Fallback to Base64 Data URI
      let base64String = originalBase64;
      if (!base64String) {
        base64String = await blobToBase64(fileToUpload);
      }

      // Check if the base64 string is too large for Firestore (~1MB limit)
      // 1 char = 1 byte in standard ASCII/Base64. We'll set a safe limit of 950,000 bytes.
      if (base64String.length > 950000) {
        throw new Error(
          "El archivo es demasiado pesado para la base de datos (~" +
            Math.round(base64String.length / 1024) +
            " KB). Por favor, sube una versión optimizada menor a 700 KB (por ejemplo, reduciendo la resolución de imágenes en el PPT o convirtiéndolo a PDF)."
        );
      }

      return base64String;
    }
  } catch (error: any) {
    console.error("Storage upload error:", error);
    throw new Error(error.message || "Error al subir el archivo. Por favor, revisa la consola.");
  }
};
