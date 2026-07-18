import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, jsonBody } from "../api/client";
import type { AuthResponse } from "../api/types";
import { useAppStore } from "../store/appStore";
import { getInitData } from "../utils/telegram";
import { getTelegramAnalyticsContext } from "../utils/telegramAnalytics";
import { initializeLanguageFromProfile, useI18nStore } from "../utils/i18n";

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
      initializeLanguageFromProfile(session.user.languageCode);
      setSession(session);
      queryClient.invalidateQueries();
      const languageCode = useI18nStore.getState().language;
      void api("/api/profile/preferences", {
        method: "PATCH",
        body: jsonBody({ languageCode })
      }).catch(() => {
        // Authentication must still succeed if preference synchronization fails.
      });
    }
  });
}
