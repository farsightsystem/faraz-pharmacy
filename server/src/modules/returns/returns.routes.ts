import { Router } from "express";
import { returnsController } from "./returns.controller";
import { authenticate } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { createReturnSchema, returnDispositionSchema } from "./returns.schema";

const router = Router();

router.use(authenticate);

router.get("/", returnsController.list);
router.get("/:id", returnsController.getById);
router.post("/", validate(createReturnSchema), returnsController.create);
router.post(
  "/items/:itemId/disposition",
  validate(returnDispositionSchema),
  returnsController.setDisposition
);

export { router as returnsRoutes };
