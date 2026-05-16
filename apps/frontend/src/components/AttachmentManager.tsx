import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Image, Paperclip, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { api, apiBlob, apiFormData } from "../api/client";
import { useI18n } from "../utils/i18n";
import { ConfirmAction } from "./ConfirmAction";
import { RequestError } from "./RequestError";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type Props = {
  petId: string;
  entryType: string;
  entryId: string;
  visible: boolean;
};

function attachmentQuery(petId: string, entryType: string, entryId: string) {
  return new URLSearchParams({ petId, entryType, entryId }).toString();
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const [objectUrl, setObjectUrl] = useState("");
  const isImage = attachment.mimeType.startsWith("image/");
  const file = useQuery({
    queryKey: ["attachment-file", attachment.id],
    queryFn: () => apiBlob(`/api/admin/attachments/${attachment.id}/file`),
    enabled: isImage,
    staleTime: 5 * 60_000
  });

  useEffect(() => {
    if (!file.data) return;
    const url = URL.createObjectURL(file.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file.data]);

  if (!isImage) {
    return <FileText size={18} className="text-zinc-500" />;
  }

  if (!objectUrl) {
    return <Image size={18} className="text-zinc-500" />;
  }

  return <img alt="" className="h-12 w-12 rounded-md object-cover" src={objectUrl} />;
}

export function AttachmentManager({ petId, entryType, entryId, visible }: Props) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [openError, setOpenError] = useState<Error | null>(null);
  const queryKey = ["attachments", entryType, entryId];
  const attachments = useQuery({
    queryKey,
    queryFn: () => api<Attachment[]>(`/api/admin/attachments?${attachmentQuery(petId, entryType, entryId)}`),
    enabled: visible
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.set("petId", petId);
      form.set("entryType", entryType);
      form.set("entryId", entryId);
      form.set("file", file);
      return apiFormData<Attachment>("/api/admin/attachments", form);
    },
    onSuccess: () => {
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey });
    }
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/admin/attachments/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey })
  });

  if (!visible) return null;

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    upload.mutate(file);
  }

  async function openAttachment(attachment: Attachment) {
    try {
      setOpenError(null);
      const blob = await apiBlob(`/api/admin/attachments/${attachment.id}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setOpenError(error as Error);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-zinc-500">
          <Paperclip size={14} />{t("attachments")}
        </p>
        <label className="btn btn-secondary min-h-8 px-2 text-xs">
          <Upload size={14} />{upload.isPending ? t("loading") : t("addAttachment")}
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={upload.isPending}
            onChange={onFileChange}
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-4 text-zinc-500">{t("attachmentUploadHint")}</p>
      {attachments.isLoading ? <p className="mt-2 text-xs text-zinc-500">{t("loading")}</p> : null}
      {attachments.data?.length ? (
        <div className="mt-2 grid gap-2">
          {attachments.data.map((attachment) => (
            <div className="flex items-center gap-2 rounded-md bg-white p-2 dark:bg-zinc-900" key={attachment.id}>
              <AttachmentThumb attachment={attachment} />
              <button className="min-w-0 flex-1 text-left" type="button" onClick={() => void openAttachment(attachment)}>
                <span className="block truncate text-sm font-semibold">{attachment.fileName}</span>
                <span className="text-xs text-zinc-500">{fileSizeLabel(attachment.sizeBytes)}</span>
              </button>
              <ConfirmAction className="icon-btn" ariaLabel={t("deleteAttachment")} disabled={remove.isPending} onConfirm={() => remove.mutate(attachment.id)}>
                <Trash2 size={15} />
              </ConfirmAction>
            </div>
          ))}
        </div>
      ) : null}
      <RequestError error={attachments.error ?? upload.error ?? remove.error ?? openError} />
    </div>
  );
}
