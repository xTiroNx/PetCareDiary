import { env } from "../config/env.js";
import { createVoiceCommandRouter } from "./voiceCommand.shared.js";

export default createVoiceCommandRouter({
  dailyLimit: () => env.VOICE_USER_DAILY_LIMIT_PER_USER ?? env.VOICE_DAILY_LIMIT_PER_USER,
  dailyLimitKeyPrefix: "user-voice",
  logEvent: "user_voice_command"
});
