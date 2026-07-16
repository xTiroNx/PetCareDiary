type CompressImageOptions = {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  targetSizeBytes?: number;
  minQuality?: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
    const context = canvas.getContext("2d");
    if (!context) return file;
    const drawingContext = context;
    const outputType = await supportsWebp() ? preferredOutputType : fallbackOutputType;
    const targetSizeBytes = options.targetSizeBytes;
    const minQuality = clamp(options.minQuality ?? Math.max(0.5, options.quality - 0.2), 0.35, options.quality);
    let outputWidth = width;
    let outputHeight = height;
    let quality = options.quality;

    async function encode() {
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      drawingContext.drawImage(image!.source, 0, 0, outputWidth, outputHeight);
      return canvasToBlob(canvas, outputType, quality);
    }

    let blob = await encode();
    let bestBlob = blob;
    while (blob && targetSizeBytes && blob.size > targetSizeBytes && quality > minQuality) {
      quality = Math.max(minQuality, Number((quality - 0.1).toFixed(2)));
      blob = await encode();
      if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob;
    }

    for (let attempt = 0; blob && targetSizeBytes && blob.size > targetSizeBytes && attempt < 4; attempt += 1) {
      const scaleDown = clamp(Math.sqrt(targetSizeBytes / blob.size) * 0.95, 0.6, 0.9);
      const nextWidth = Math.max(1, Math.round(outputWidth * scaleDown));
      const nextHeight = Math.max(1, Math.round(outputHeight * scaleDown));
      if (nextWidth === outputWidth && nextHeight === outputHeight) break;
      outputWidth = nextWidth;
      outputHeight = nextHeight;
      blob = await encode();
      if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob;
    }

    if (!bestBlob || bestBlob.size >= file.size) return file;

    return new File([bestBlob], outputFileName(file.name, bestBlob.type || outputType), {
      type: bestBlob.type || outputType,
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    image?.cleanup();
  }
}
