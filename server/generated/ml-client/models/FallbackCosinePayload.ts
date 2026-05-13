/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Same symptom list shape as /predict; uses ML cache diseases for overlap fallback.
 */
export type FallbackCosinePayload = {
    symptoms: Array<string>;
    profile?: Record<string, any>;
    round?: number;
};

