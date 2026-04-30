import { createApp } from "./app.js";
import { backendPort } from "./config/env.js";

const app = createApp();

app.listen(backendPort, () => {
  console.log(`PetCare Diary backend listening on :${backendPort}`);
});
