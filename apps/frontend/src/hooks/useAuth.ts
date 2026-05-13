import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, jsonBody } from "../api/client";
import type { AuthResponse } from "../api/types";
import { useAppStore } from "../store/appStore";
import { getInitData } from "../utils/telegram";
import { getTelegramAnalyticsContext } from "../utils/telegramAnalytics";

export function useAuth() {
  const queryClient = useQueryClient();
  const setSession = useAppStore((state) => state.setSession);

  return useMutation({
    mutationFn: () => {
      const { languageCode, platform, startParam } = getTelegramAnalyticsContext();
      return api<AuthResponse>("/api/auth/telegram", {
        method: "POST",
        body: jsonBody({ initData: getInitData(), languageCode, platform, startParam })
      });
    },
    onSuccess: (session) => {
      setSession(session);
      queryClient.invalidateQueries();
    }
  });
}
