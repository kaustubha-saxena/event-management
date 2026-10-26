import { createApp } from "./application.js";
import { assertConfigured, readConfig } from "./config.js";

const config = readConfig();
assertConfigured(config);
const app = createApp({ config });
const server = app.listen(config.PORT, () => {
  console.log(`CampusFlow listening at ${config.APP_URL}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
