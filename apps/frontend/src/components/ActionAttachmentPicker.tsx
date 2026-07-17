import { Paperclip, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import {
  attachmentAccept,
  attachmentFileSizeLabel,
  isSupportedAttachmentFile
} from "../utils/attachments";
import { useI18n } from "../utils/i18n";
import { RequestError } from "./RequestError";

type Props = {
  visible: boolean;
  file: File | null;
  disabled?: boolean;
  isPreparing?: boolean;
  uploadError?: Error | null;
  onFileChange: (file: File | null) => void;
  onClear: () => void;
};

export function ActionAttachmentPicker({ visible, file, disabled, isPreparing, uploadError, onFileChange, onClear }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [validationError, setValidationError] = useState<Error | null>(null);

  if (!visible) return null;

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;
    if (!isSupportedAttachmentFile(nextFile)) {
      setValidationError(new Error(t("attachmentUnsupported")));
      onFileChange(null);
      clearInput();
      return;
    }
    setValidationError(null);
    onFileChange(nextFile);
  }

  function clearSelection() {
    setValidationError(null);
    onClear();
    clearInput();
  }

  return (
    <div className="rounded-lg border border-dashed border-mint/35 bg-mint/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="btn btn-secondary min-h-10 flex-1 cursor-pointer px-3 text-sm">
          <Paperclip size={16} />{isPreparing ? t("photoPreparing") : file ? t("selectedAttachment") : t("addAttachment")}
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={attachmentAccept}
            disabled={disabled}
            onChange={onChange}
          />
        </label>
        {file ? (
          <button className="icon-btn shrink-0" type="button" aria-label={t("clearAttachment")} disabled={disabled} onClick={clearSelection}>
            <X size={16} />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-zinc-500">{t("attachmentUploadHint")}</p>
      {file ? (
        <p className="mt-2 truncate rounded-md bg-white px-2 py-1.5 text-xs font-semibold dark:bg-zinc-950">
          {file.name} · {attachmentFileSizeLabel(file.size)}
        </p>
      ) : null}
      <RequestError error={validationError ?? uploadError} />
    </div>
  );
}
