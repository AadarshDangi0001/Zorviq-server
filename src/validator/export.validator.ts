import { z } from "zod";
import { objectIdString, validate } from "./zod.validator.js";

const projectIdParamSchema = z.object({
  projectId: objectIdString("Invalid projectId format"),
});

export const validateExportProjectIdParam = validate(
  projectIdParamSchema,
  "params"
);
