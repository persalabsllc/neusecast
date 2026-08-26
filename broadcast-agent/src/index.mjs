import { BroadcastAgent } from "./agent.mjs";
import { loadConfig } from "./config.mjs";

let agent;
try {
  agent = new BroadcastAgent(loadConfig());
  await agent.start();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "fatal", message: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await agent?.stop(signal);
    process.exit(0);
  });
}
