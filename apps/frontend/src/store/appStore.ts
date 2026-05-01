import { create } from "zustand";
import type { AccessStatus, AuthResponse, Pet, User } from "../api/types";

type AppState = {
  user: User | null;
  pet: Pet | null;
  pets: Pet[];
  activePetId: string | null;
  accessStatus: AccessStatus;
  accessEndsAt: string | null;
  isAdmin: boolean;
  setSession: (session: AuthResponse) => void;
  setPet: (pet: Pet | null) => void;
  setPets: (pets: Pet[]) => void;
  setActivePet: (petId: string) => void;
};

const activePetStorageKey = "petcare-active-pet-id";

function choosePet(pets: Pet[], preferredId?: string | null) {
  return pets.find((pet) => pet.id === preferredId) ?? pets[0] ?? null;
}

function storeActivePet(pet: Pet | null) {
  if (pet) localStorage.setItem(activePetStorageKey, pet.id);
  else localStorage.removeItem(activePetStorageKey);
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  pet: null,
  pets: [],
  activePetId: null,
  accessStatus: "expired",
  accessEndsAt: null,
  isAdmin: false,
  setSession: (session) => {
    const pets = session.pets ?? (session.pet ? [session.pet] : []);
    const preferredId = localStorage.getItem(activePetStorageKey) ?? session.pet?.id ?? null;
    const activePet = choosePet(pets, preferredId);
    storeActivePet(activePet);
    set({
      user: session.user,
      pet: activePet,
      pets,
      activePetId: activePet?.id ?? null,
      accessStatus: session.accessStatus,
      accessEndsAt: session.accessEndsAt,
      isAdmin: Boolean(session.isAdmin ?? session.user.isAdmin)
    });
  },
  setPet: (pet) => {
    const pets = pet ? [pet, ...get().pets.filter((item) => item.id !== pet.id)] : get().pets;
    storeActivePet(pet);
    set({ pet, pets, activePetId: pet?.id ?? null });
  },
  setPets: (pets) => {
    const activePet = choosePet(pets, get().activePetId);
    storeActivePet(activePet);
    set({ pets, pet: activePet, activePetId: activePet?.id ?? null });
  },
  setActivePet: (petId) => {
    const pet = choosePet(get().pets, petId);
    storeActivePet(pet);
    set({ pet, activePetId: pet?.id ?? null });
  }
}));
