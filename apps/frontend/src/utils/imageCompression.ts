type CompressImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
};

const preferredOutputType = "image/webp";
const fallbackOutputType = "image/jpeg";
let webpSupport: Promise<boolean> | null = null;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function supportsWebp() {
  if (!webpSupport) {
    webpSupport = (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const blob = await canvasToBlob(canvas, preferredOutputType, 0.8);
      return blob?.type === preferredOutputType;
    })();
  }
  return webpSupport;
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close()
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  await image.decode();
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(objectUrl)
  };
}

function outputFileName(fileName: string, mimeType: string) {
  const extension = mimeType === preferredOutputType ? "webp" : "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "image"}.${extension}`;
}

export async function compressImageFile(file: File, options: CompressImageOptions) {
  if (!file.type.startsWith("image/")) return file;

  let image: LoadedImage | null = null;
  try {
    image = await loadImage(file);
    const scale = Math.min(1, options.maxWidth / image.width, options.maxHeight / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image.source, 0, 0, width, height);
    const outputType = await supportsWebp() ? preferredOutputType : fallbackOutputType;
    const blob = await canvasToBlob(canvas, outputType, options.quality);
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], outputFileName(file.name, blob.type || outputType), {
      type: blob.type || outputType,
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    image?.cleanup();
  }
}
