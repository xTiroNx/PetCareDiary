import { create } from "zustand";
import type { AccessStatus, AuthResponse, Pet, User } from "../api/types";

type AppState = {
  user: User | null;
  pet: Pet | null;
  accessStatus: AccessStatus;
  accessEndsAt: string | null;
  isAdmin: boolean;
  setSession: (session: AuthResponse) => void;
  setPet: (pet: Pet | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  user: null,
  pet: null,
  accessStatus: "expired",
  accessEndsAt: null,
  isAdmin: false,
  setSession: (session) => set({ user: session.user, pet: session.pet, accessStatus: session.accessStatus, accessEndsAt: session.accessEndsAt, isAdmin: Boolean(session.isAdmin ?? session.user.isAdmin) }),
  setPet: (pet) => set({ pet })
}));
