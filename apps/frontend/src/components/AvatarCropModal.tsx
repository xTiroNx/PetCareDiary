import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../utils/i18n";

type AvatarCropModalProps = {
  file: File;
  onCancel: () => void;
  onSave: (file: File) => void;
};

type Point = {
  x: number;
  y: number;
};

type ImageSize = {
  width: number;
  height: number;
};

const outputSize = 768;
const preferredOutputType = "image/webp";
const fallbackOutputType = "image/jpeg";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function outputFileName(fileName: string, mimeType: string) {
  const extension = mimeType === preferredOutputType ? "webp" : "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName || "avatar"}.${extension}`;
}

function clampOffset(offset: Point, cropSize: number, imageSize: ImageSize | null, zoom: number) {
  if (!cropSize || !imageSize) return { x: 0, y: 0 };
  const coverScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
  const renderedWidth = imageSize.width * coverScale * zoom;
  const renderedHeight = imageSize.height * coverScale * zoom;
  const maxX = Math.max(0, (renderedWidth - cropSize) / 2);
  const maxY = Math.max(0, (renderedHeight - cropSize) / 2);
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY)
  };
}

export function AvatarCropModal({ file, onCancel, onSave }: AvatarCropModalProps) {
  const { t } = useI18n();
  const cropRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [cropSize, setCropSize] = useState(0);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragStart, setDragStart] = useState<{ pointer: Point; offset: Point } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const nextImageUrl = URL.createObjectURL(file);
    setImageUrl(nextImageUrl);
    setImageSize(null);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
    return () => URL.revokeObjectURL(nextImageUrl);
  }, [file]);

  useEffect(() => {
    const element = cropRef.current;
    if (!element) return;
    const cropElement = element;

    function updateSize() {
      setCropSize(cropElement.clientWidth);
    }

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(cropElement);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOffset((current) => clampOffset(current, cropSize, imageSize, zoom));
  }, [cropSize, imageSize, zoom]);

  const renderedImage = useMemo(() => {
    if (!cropSize || !imageSize) return null;
    const coverScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
    const width = imageSize.width * coverScale * zoom;
    const height = imageSize.height * coverScale * zoom;
    return { width, height };
  }, [cropSize, imageSize, zoom]);

  function updateOffset(nextOffset: Point) {
    setOffset(clampOffset(nextOffset, cropSize, imageSize, zoom));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!imageSize) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      pointer: { x: event.clientX, y: event.clientY },
      offset
    });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    updateOffset({
      x: dragStart.offset.x + event.clientX - dragStart.pointer.x,
      y: dragStart.offset.y + event.clientY - dragStart.pointer.y
    });
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  }

  async function saveCroppedImage() {
    const image = imageRef.current;
    if (!image || !imageSize || !renderedImage || !cropSize) {
      onSave(file);
      return;
    }

    setIsSaving(true);
    try {
      const left = (cropSize - renderedImage.width) / 2 + offset.x;
      const top = (cropSize - renderedImage.height) / 2 + offset.y;
      const sourceX = clamp((-left / renderedImage.width) * imageSize.width, 0, imageSize.width);
      const sourceY = clamp((-top / renderedImage.height) * imageSize.height, 0, imageSize.height);
      const sourceWidth = clamp((cropSize / renderedImage.width) * imageSize.width, 1, imageSize.width - sourceX);
      const sourceHeight = clamp((cropSize / renderedImage.height) * imageSize.height, 1, imageSize.height - sourceY);

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) {
        onSave(file);
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputSize, outputSize);

      const webpBlob = await canvasToBlob(canvas, preferredOutputType, 0.8);
      const blob = webpBlob?.type === preferredOutputType ? webpBlob : await canvasToBlob(canvas, fallbackOutputType, 0.8);
      if (!blob) {
        onSave(file);
        return;
      }

      onSave(new File([blob], outputFileName(file.name, blob.type || fallbackOutputType), {
        type: blob.type || fallbackOutputType,
        lastModified: Date.now()
      }));
    } catch {
      onSave(file);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <section className="panel w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">{t("avatarCropTitle")}</h2>
          <button className="icon-btn" type="button" aria-label={t("avatarCropCancel")} onClick={onCancel}>
            ×
          </button>
        </div>

        <div
          ref={cropRef}
          className="relative mx-auto aspect-square w-full max-w-[320px] touch-none overflow-hidden rounded-[28px] border border-mint/40 bg-zinc-950"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerCancel={onPointerEnd}
          onPointerUp={onPointerEnd}
        >
          {imageUrl ? (
            <img
              ref={imageRef}
              className="absolute left-1/2 top-1/2 max-w-none select-none"
              src={imageUrl}
              alt=""
              draggable={false}
              style={{
                width: renderedImage?.width ?? "auto",
                height: renderedImage?.height ?? "auto",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`
              }}
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight
                });
              }}
            />
          ) : null}
          <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-2 ring-inset ring-white/80" />
        </div>

        <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
          {t("avatarCropZoom")}
          <input
            className="w-full accent-mint"
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary" type="button" disabled={isSaving} onClick={onCancel}>
            {t("avatarCropCancel")}
          </button>
          <button className="btn btn-primary" type="button" disabled={isSaving || !imageSize} onClick={saveCroppedImage}>
            {isSaving ? t("photoPreparing") : t("avatarCropSave")}
          </button>
        </div>
      </section>
    </div>
  );
}
