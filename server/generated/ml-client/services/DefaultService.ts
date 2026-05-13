/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FallbackCosinePayload } from '../models/FallbackCosinePayload';
import type { FeedbackPayload } from '../models/FeedbackPayload';
import type { PredictPayload } from '../models/PredictPayload';
import type { PreliminaryPayload } from '../models/PreliminaryPayload';
import type { PreprocessPayload } from '../models/PreprocessPayload';
import type { SwitchVersionPayload } from '../models/SwitchVersionPayload';
import type { TrainPayload } from '../models/TrainPayload';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DefaultService {
    /**
     * Health
     * @returns any Successful Response
     * @throws ApiError
     */
    public static healthHealthGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/health',
        });
    }
    /**
     * Metrics
     * @returns any Successful Response
     * @throws ApiError
     */
    public static metricsMetricsGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/metrics',
        });
    }
    /**
     * List Models
     * @returns any Successful Response
     * @throws ApiError
     */
    public static listModelsModelsGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/models',
        });
    }
    /**
     * Switch Model Version
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static switchModelVersionModelsSwitchPost(
        requestBody: SwitchVersionPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/models/switch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Prometheus Metrics
     * @returns any Successful Response
     * @throws ApiError
     */
    public static prometheusMetricsPrometheusGet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/prometheus',
        });
    }
    /**
     * Preprocess Endpoint
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static preprocessEndpointPreprocessPost(
        requestBody: PreprocessPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/preprocess',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Symptom Vocabulary
     * @returns any Successful Response
     * @throws ApiError
     */
    public static symptomVocabularyCatalogSymptomVocabularyGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/catalog/symptom-vocabulary',
        });
    }
    /**
     * Fallback Cosine Endpoint
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static fallbackCosineEndpointFallbackCosinePost(
        requestBody: FallbackCosinePayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/fallback/cosine',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Train
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static trainTrainPost(
        requestBody: TrainPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/train',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Feedback
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static feedbackFeedbackPost(
        requestBody: FeedbackPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/feedback',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Predict
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static predictPredictPost(
        requestBody: PredictPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/predict',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Preliminary
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static preliminaryPreliminaryPost(
        requestBody: PreliminaryPayload,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/preliminary',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
