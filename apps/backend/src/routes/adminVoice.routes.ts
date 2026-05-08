import { env } from "../config/env.js";
import { createVoiceCommandRouter } from "./voiceCommand.shared.js";

export default createVoiceCommandRouter({
  dailyLimit: () => env.VOICE_ADMIN_DAILY_LIMIT_PER_USER ?? env.VOICE_DAILY_LIMIT_PER_USER,
  dailyLimitKeyPrefix: "admin-voice",
  logEvent: "admin_voice_command"
});
