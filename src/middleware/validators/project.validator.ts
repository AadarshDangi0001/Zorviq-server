import { body, param } from "express-validator";
import { handleValidationErrors } from "../validate.middleware.js";

export const validateProjectId = [
    param("projectId").isMongoId().withMessage("Invalid project ID"),
    handleValidationErrors,
];

export const validateCreateProject = [
    body("name")
        .optional()
        .isString().withMessage("Name must be a string")
        .trim()
        .isLength({ min: 1, max: 100 }).withMessage("Name must be 1-100 characters"),
    handleValidationErrors,
];

export const validateRenameProject = [
    param("projectId").isMongoId().withMessage("Invalid project ID"),
    body("name")
        .exists({ checkFalsy: true }).withMessage("Name is required")
        .isString().withMessage("Name must be a string")
        .trim()
        .isLength({ min: 1, max: 100 }).withMessage("Name must be 1-100 characters"),
    handleValidationErrors,
];
