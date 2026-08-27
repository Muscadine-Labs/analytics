/**
 * Environment Variable Validation
 * RPC keys are optional; public Base RPCs are used as fallback.
 */

import { logger } from './logger';

interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvVars(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.ALCHEMY_API_KEY) {
    warnings.push(
      'ALCHEMY_API_KEY is not set. Oracle freshness, IRM utilization, and timelock reads will use public Base RPCs (rate limited).'
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

export function logEnvValidation(): void {
  const result = validateEnvVars();

  if (result.errors.length > 0) {
    logger.error('Environment variable validation failed', new Error('Missing required environment variables'), {
      errors: result.errors,
    });
  }

  if (result.warnings.length > 0) {
    result.warnings.forEach((warning) => {
      logger.warn(warning);
    });
  }

  if (result.isValid && result.warnings.length === 0) {
    logger.info('Environment variables validated successfully');
  }
}
