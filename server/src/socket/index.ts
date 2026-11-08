import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { logger } from "../utils/logger";
import { prisma } from "../services/prisma";
import { medicinesService } from "../modules/medicines/medicines.service";

let io: Server;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    /**
     * Fast barcode lookup over Socket.io.
     * Client emits: { barcode: string }
     * Server responds via callback with product or null.
     */
    socket.on(
      "product:scan",
      async (
        data: { barcode: string },
        callback: (result: {
          id: string;
          barcode: string;
          name: string;
          salePrice: number;
          purchasePrice: number;
          stockQty: number;
          category: string;
          location: string;
          active: number;
          company: { name: string } | null;
          prices: {
            id: string;
            productId: string;
            label: string;
            purchasePrice: number;
            salePrice: number;
          }[];
        } | null) => void
      ) => {
        try {
          // Reuse the service method so REST and Socket barcode lookups share
          // one query path (and the short-TTL scan cache).
          const product = await medicinesService.getByBarcodeFast(data.barcode);
          callback(product as never);
        } catch (err) {
          logger.error("Socket product:scan error:", err);
          callback(null);
        }
      }
    );

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  return io;
}

export function emitEvent(event: string, data: unknown) {
  if (io) {
    io.emit(event, data);
  }
}
