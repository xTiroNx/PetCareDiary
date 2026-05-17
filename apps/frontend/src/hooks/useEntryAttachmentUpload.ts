import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AttachmentEntryType, uploadEntryAttachment } from "../utils/attachments";
import { TranslationKey } from "../utils/i18n";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function useEntryAttachmentUpload(entryType: AttachmentEntryType, petId: string | undefined, t: Translate) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function selectFile(nextFile: File | null) {
    setError(null);
    setFile(nextFile);
  }

  function clearFile() {
    setError(null);
    setFile(null);
  }

  async function uploadForEntry(entryId: string) {
    if (!file || !petId) return;
    setError(null);
    setIsUploading(true);
    try {
      await uploadEntryAttachment({ petId, entryType, entryId, file });
      setFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["diary"] }),
        queryClient.invalidateQueries({ queryKey: ["attachments", entryType, entryId] })
      ]);
    } catch {
      setError(new Error(t("attachmentUploadAfterCreateFailed")));
    } finally {
      setIsUploading(false);
    }
  }

  return { file, error, isUploading, selectFile, clearFile, uploadForEntry };
}
