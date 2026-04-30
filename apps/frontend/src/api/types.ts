export type AccessStatus = "admin" | "trial" | "active_monthly" | "lifetime" | "expired";
export type PetType = "CAT" | "DOG" | "OTHER";

export type User = {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  trialEndsAt: string;
  accessUntil?: string | null;
  lifetimeAccess: boolean;
  isAdmin?: boolean;
};

export type Pet = {
  id: string;
  name: string;
  type: PetType;
  weightKg?: string | number | null;
  ageYears?: string | number | null;
  healthNotes?: string | null;
};

export type AuthResponse = {
  user: User;
  pet: Pet | null;
  isAdmin?: boolean;
  accessStatus: AccessStatus;
  accessEndsAt: string | null;
};

export type AdminUser = User & {
  lastName?: string | null;
  languageCode?: string | null;
  createdAt: string;
  accessStatus: AccessStatus;
  accessEndsAt: string | null;
  pet?: Pick<Pet, "id" | "name" | "type"> | null;
};
