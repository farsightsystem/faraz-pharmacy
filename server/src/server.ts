import http from "http";
import { config } from "./config/env";
import { app } from "./app";
import { logger } from "./utils/logger";
import { prisma } from "./services/prisma";
import { initializeSocket, getIO } from "./socket";
import { startAutoBackupScheduler, stopAutoBackupScheduler } from "./modules/settings/scheduler";
import "./config/env.js";

async function main() {
  try {
    await prisma.$connect();
    logger.info("Database connected");

    const httpServer = http.createServer(app);
    initializeSocket(httpServer);

    startAutoBackupScheduler();

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.error(
          `Port ${config.port} is already in use. Stop the other server process (or set a different PORT) and retry.`
        );
      } else {
        logger.error("HTTP server error:", err);
      }
      stopAutoBackupScheduler();
      getIO()?.close();
      process.exit(1);
    });

    httpServer.listen(config.port, "0.0.0.0", () => {
      logger.info(`Faraz Pharmacy API server running on port ${config.port}`);
    });
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();

function shutdown() {
  stopAutoBackupScheduler();
  getIO()?.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
