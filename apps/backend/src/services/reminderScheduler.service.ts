// MVP placeholder. Wire this into a cron/queue worker when Telegram reminder delivery is enabled.
// The service should load active reminders, resolve due items, and call sendMessage via Bot API.
export async function processDueReminders() {
  return { processed: 0 };
}
