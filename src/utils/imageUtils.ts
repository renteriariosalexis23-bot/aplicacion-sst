import { ref, getBytes } from "firebase/storage";
import { storage } from "../firebase";

export const getBase64ImageFromURL = async (url: string): Promise<string> => {
  if (!url) throw new Error("URL is empty");
  if (url.startsWith("data:image")) return url;

  console.log("Attempting to fetch image:", url);

  const fetchWithTimeout = async (
    fetchUrl: string,
    options: RequestInit = {},
    timeout = 15000,
  ) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(fetchUrl, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  // Try fetching with cache buster first (to avoid cached CORS errors)
  try {
    const cacheBuster = `t=${Date.now()}`;
    const finalUrl = url.includes("?")
      ? `${url}&${cacheBuster}`
      : `${url}?${cacheBuster}`;

    const response = await fetchWithTimeout(finalUrl, { mode: "cors" });
    if (response.ok) {
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn("Fetch with cache buster failed:", e);
  }

  // Try fetching without cache buster
  try {
    const response = await fetchWithTimeout(url, { mode: "cors" });
    if (response.ok) {
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn("Fetch without cache buster failed:", e);
  }

  // Try Canvas fallback (often works well if crossOrigin is set)
  try {
    console.log("Attempting Canvas fallback...");
    const canvasData = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        try {
          const dataURL = canvas.toDataURL("image/png");
          resolve(dataURL);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = (e) =>
        reject(new Error("Image load error in canvas fallback"));
      img.src = url.includes("?")
        ? `${url}&t=${Date.now()}`
        : `${url}?t=${Date.now()}`;
    });
    return canvasData;
  } catch (canvasError) {
    console.warn("Canvas fallback failed:", canvasError);
  }

  // Try CORS proxies
  console.log("Attempting fetch via CORS proxies...");
  const encodedUrl = encodeURIComponent(url);
  const proxies = [
    `https://corsproxy.io/?${url}`, // corsproxy.io expects unencoded
    `https://api.allorigins.win/raw?url=${encodedUrl}`, // allorigins expects encoded
    `https://api.codetabs.com/v1/proxy?quest=${url}`, // codetabs expects unencoded
    `https://thingproxy.freeboard.io/fetch/${url}`, // thingproxy expects unencoded
  ];

  for (const proxyUrl of proxies) {
    try {
      const response = await fetchWithTimeout(proxyUrl);
      if (response.ok) {
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(blob);
        });
      }
    } catch (proxyError) {
      console.warn(`Proxy fetch failed for ${proxyUrl}:`, proxyError);
    }
  }

  // Fallback: Try using Firebase Storage SDK (only if it's a Firebase URL)
  if (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("appspot.com")
  ) {
    try {
      console.log("Attempting fetch via Storage SDK getBytes...");
      const storageRef = ref(storage, url);

      const sdkPromise = getBytes(storageRef);
      const timeoutPromise = new Promise<ArrayBuffer>((_, reject) =>
        setTimeout(() => reject(new Error("Storage SDK timeout")), 60000),
      );

      const bytes = await Promise.race([sdkPromise, timeoutPromise]);

      let binary = "";
      const bytesArray = new Uint8Array(bytes);
      const len = bytesArray.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytesArray[i]);
      }
      const base64 = window.btoa(binary);
      const mimeType =
        url.toLowerCase().includes(".jpg") ||
        url.toLowerCase().includes(".jpeg")
          ? "image/jpeg"
          : "image/png";
      return `data:${mimeType};base64,${base64}`;
    } catch (storageError) {
      console.error("Storage SDK fetch failed:", storageError);
    }
  }

  throw new Error("Failed to fetch image after all attempts");
};

/**
 * Robustly loads an image from a URL, scales it to a safe bounding box,
 * and returns it as a base64 PNG. This guarantees the format is PNG
 * and prevents jsPDF scaling quirks, especially with transparent/WebP inputs.
 */
export const getNormalizedPdfImage = async (
  url: string,
  maxWidth = 140,
  maxHeight = 72
): Promise<string> => {
  try {
    const base64Url = await getBase64ImageFromURL(url);

    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        if (width === 0 || height === 0) {
          reject(new Error("Image has 0 dimensions"));
          return;
        }
        
        // We want to fit it inside maxWidth x maxHeight
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        const newWidth = Math.floor(width * ratio);
        const newHeight = Math.floor(height * ratio);
        
        const canvas = document.createElement("canvas");
        // Create a canvas of the exact boundary to center the image
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          reject(new Error("No canvas context"));
          return;
        }
        
        // Center it
        const x = (maxWidth - newWidth) / 2;
        const y = (maxHeight - newHeight) / 2;
        
        ctx.drawImage(img, x, y, newWidth, newHeight);
        resolve(canvas.toDataURL("image/png"));
      };
      
      img.onerror = () => reject(new Error("Normalized image load failed during conversion"));
      img.src = base64Url;
    });
  } catch (error: any) {
    throw new Error(`Normalized image load failed: ${error.message}`);
  }
};
