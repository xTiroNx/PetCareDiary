import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, PawPrint, Trash2, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { Pet } from "../api/types";
import { apiBlob } from "../api/client";
import { attachmentFileSizeLabel } from "../utils/attachments";
import {
  avatarAccept,
  deletePetAvatar,
  isSupportedAvatarFile,
  maxAvatarSizeBytes,
  petAvatarPath,
  uploadPetAvatar,
  withAvatarFallback
} from "../utils/petAvatar";
import { useI18n } from "../utils/i18n";
import { RequestError } from "./RequestError";

type PetAvatarProps = {
  pet: Pet;
  size?: "sm" | "md" | "lg" | "xl";
};

type AvatarFilePickerProps = {
  file: File | null;
  disabled?: boolean;
  uploadError?: Error | null;
  mode?: "upload" | "change";
  onFileChange: (file: File | null) => void;
  onClear: () => void;
};

type PetAvatarEditorProps = {
  pet: Pet;
  onPetChange: (pet: Pet) => void;
};

const sizeClassNames = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-16 w-16 rounded-2xl",
  xl: "h-24 w-24 rounded-[22px]"
};

function validateAvatar(file: File, t: ReturnType<typeof useI18n>["t"]) {
  if (!isSupportedAvatarFile(file)) return new Error(t("avatarUnsupportedImage"));
  if (file.size > maxAvatarSizeBytes) return new Error(t("avatarFileTooLarge"));
  return null;
}

export function PetAvatar({ pet, size = "md" }: PetAvatarProps) {
  const [objectUrl, setObjectUrl] = useState("");
  const file = useQuery({
    queryKey: ["pet-avatar", pet.id, pet.avatarUpdatedAt],
    queryFn: async () => {
      const blob = await apiBlob(petAvatarPath(pet.id, pet.avatarUpdatedAt));
      return blob.size > 0 ? blob : null;
    },
    enabled: Boolean(pet.hasAvatar),
    staleTime: 5 * 60_000
  });

  useEffect(() => {
    if (!file.data) {
      setObjectUrl("");
      return;
    }
    const url = URL.createObjectURL(file.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file.data]);

  const className = `${sizeClassNames[size]} shrink-0 overflow-hidden border border-mint/30 bg-mint/10`;

  if (pet.hasAvatar && objectUrl) {
    return <img className={`${className} object-cover`} src={objectUrl} alt={pet.name} />;
  }

  return (
    <div className={`${className} flex items-center justify-center text-mint`}>
      <PawPrint size={size === "sm" ? 18 : size === "xl" ? 36 : 24} />
    </div>
  );
}

export function AvatarFilePicker({ file, disabled, uploadError, mode = "upload", onFileChange, onClear }: AvatarFilePickerProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [validationError, setValidationError] = useState<Error | null>(null);

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;
    const error = validateAvatar(nextFile, t);
    if (error) {
      setValidationError(error);
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
          <Camera size={16} />{file ? t("selectedAttachment") : mode === "change" ? t("changeAvatar") : t("uploadAvatar")}
          <input ref={inputRef} className="sr-only" type="file" accept={avatarAccept} disabled={disabled} onChange={onChange} />
        </label>
        {file ? (
          <button className="icon-btn shrink-0" type="button" aria-label={t("clearAttachment")} disabled={disabled} onClick={clearSelection}>
            <X size={16} />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-zinc-500">{t("avatarUploadHint")}</p>
      {file ? (
        <p className="mt-2 truncate rounded-md bg-white px-2 py-1.5 text-xs font-semibold dark:bg-zinc-950">
          {file.name} · {attachmentFileSizeLabel(file.size)}
        </p>
      ) : null}
      <RequestError error={validationError ?? uploadError} />
    </div>
  );
}

export function PetAvatarEditor({ pet, onPetChange }: PetAvatarEditorProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [validationError, setValidationError] = useState<Error | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadPetAvatar(pet.id, file),
    onSuccess: (updatedPet) => {
      onPetChange(updatedPet ?? withAvatarFallback(pet, true));
      void queryClient.invalidateQueries({ queryKey: ["pet-avatar", pet.id] });
      if (inputRef.current) inputRef.current.value = "";
    }
  });
  const remove = useMutation({
    mutationFn: () => deletePetAvatar(pet.id),
    onSuccess: (updatedPet) => {
      onPetChange(updatedPet ?? withAvatarFallback(pet, false));
      void queryClient.invalidateQueries({ queryKey: ["pet-avatar", pet.id] });
    }
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    const error = validateAvatar(file, t);
    if (error) {
      setValidationError(error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setValidationError(null);
    upload.mutate(file);
  }

  return (
    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
      <div className="flex items-center gap-3">
        <PetAvatar pet={pet} />
        <div className="grid min-w-0 flex-1 gap-2">
          <label className="btn btn-secondary min-h-9 cursor-pointer px-3 text-xs">
            <Camera size={15} />{pet.hasAvatar ? t("changeAvatar") : t("uploadAvatar")}
            <input ref={inputRef} className="sr-only" type="file" accept={avatarAccept} disabled={upload.isPending || remove.isPending} onChange={onFileChange} />
          </label>
          {pet.hasAvatar ? (
            <button className="btn btn-secondary min-h-9 px-3 text-xs" type="button" disabled={upload.isPending || remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 size={15} />{t("removeAvatar")}
            </button>
          ) : null}
        </div>
      </div>
      <RequestError error={validationError ?? upload.error ?? remove.error} />
    </div>
  );
}
