import { Router } from "express";
import { medicinesController } from "./medicines.controller";
import { validate } from "../../middleware/validate";
import { createProductSchema } from "./medicines.schema";

const router = Router();

router.get("/", medicinesController.list);
router.get("/search", medicinesController.search);
router.get("/barcode/:b", medicinesController.getByBarcode);
router.get("/barcode-fast/:b", medicinesController.getByBarcodeFast);
router.get("/:id", medicinesController.getById);
router.post("/", validate(createProductSchema), medicinesController.create);
router.put("/:id", validate(createProductSchema), medicinesController.update);
router.delete("/:id", medicinesController.archive);
router.post("/:id/restore", medicinesController.restore);
router.delete("/:id/hard", medicinesController.hardDelete);

export { router as medicinesRoutes };
