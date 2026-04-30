import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, jsonBody } from "../api/client";
import type { AuthResponse } from "../api/types";
import { useAppStore } from "../store/appStore";
import { getInitData } from "../utils/telegram";

export function useAuth() {
  const queryClient = useQueryClient();
  const setSession = useAppStore((state) => state.setSession);

  return useMutation({
    mutationFn: () => api<AuthResponse>("/api/auth/telegram", { method: "POST", body: jsonBody({ initData: getInitData() }) }),
    onSuccess: (session) => {
      setSession(session);
      queryClient.invalidateQueries();
    }
  });
}
