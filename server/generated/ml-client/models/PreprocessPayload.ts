/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Same symptom normalization and feature layout as /predict (single source of truth).
 */
export type PreprocessPayload = {
    raw_symptoms?: Array<string>;
    profile?: Record<string, any>;
    answers?: Record<string, any>;
};

