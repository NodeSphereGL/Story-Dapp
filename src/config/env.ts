import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment schema validation
const envSchema = z.object({
  // Database
  MYSQL_URL: z.string().url(),
  
  // Storyscan API
  STORYSCAN_BASE: z.string().url(),
  RATE_LIMIT_MIN_TIME_MS: z.string().transform(Number).pipe(z.number().min(50)),
  
  // Ingestion
  INGEST_HOURS_BACK: z.string().transform(Number).pipe(z.number().min(1).max(168)),
  INGEST_INTERVAL_MINUTES: z.string().transform(Number).pipe(z.number().min(1).max(60)),
  
  // Server
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// Parse and validate environment
const envParseResult = envSchema.safeParse(process.env);

if (!envParseResult.success) {
  console.error('❌ Invalid environment variables:', envParseResult.error.format());
  process.exit(1);
}

export const env = envParseResult.data;

// Export individual configs for convenience
export const dbConfig = {
  url: env.MYSQL_URL,
};

export const storyscanConfig = {
  baseUrl: env.STORYSCAN_BASE,
  rateLimitMs: env.RATE_LIMIT_MIN_TIME_MS,
};

export const ingestionConfig = {
  hoursBack: env.INGEST_HOURS_BACK,
  intervalMinutes: env.INGEST_INTERVAL_MINUTES,
};

export const serverConfig = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
};

export const logConfig = {
  level: env.LOG_LEVEL,
};
