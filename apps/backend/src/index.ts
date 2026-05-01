import { createApp } from "./app.js";
import { backendPort } from "./config/env.js";
import { startReminderScheduler } from "./services/reminderScheduler.service.js";

const app = createApp();

app.listen(backendPort, () => {
  console.log(`PetCare Diary backend listening on :${backendPort}`);
  startReminderScheduler();
});
