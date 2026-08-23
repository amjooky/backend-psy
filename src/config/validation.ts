import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  PORT: Joi.number().default(3000),
  APP_URL: Joi.string().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().default('http://localhost:3002'),
  API_PREFIX: Joi.string().default('api/v1'),

  // Database
  DATABASE_URL: Joi.string().required(),

  // Redis
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),
  REDIS_TLS: Joi.boolean().default(false),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  JWT_EMAIL_VERIFY_SECRET: Joi.string().min(32).required(),
  JWT_EMAIL_VERIFY_EXPIRY: Joi.string().default('24h'),
  JWT_RESET_PASSWORD_SECRET: Joi.string().min(32).required(),
  JWT_RESET_PASSWORD_EXPIRY: Joi.string().default('1h'),

  // Security
  BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12),
  ENCRYPTION_KEY: Joi.string().min(32).required(),

  // MinIO / Storage
  MINIO_ENDPOINT: Joi.string().default('localhost'),
  MINIO_PORT: Joi.number().default(9000),
  MINIO_USE_SSL: Joi.boolean().default(false),
  MINIO_ACCESS_KEY: Joi.string().default('minioadmin'),
  MINIO_SECRET_KEY: Joi.string().default('minioadmin'),
  MINIO_BUCKET_NAME: Joi.string().default('monpsy'),
  MINIO_PUBLIC_URL: Joi.string().default('http://localhost:9000'),

  // SMTP
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  SMTP_FROM_NAME: Joi.string().default('Monpsy Team'),
  SMTP_FROM_EMAIL: Joi.string().email().default('no-reply@monpsy.tn'),

  // Rate Limiting
  THROTTLE_TTL: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),
  AUTH_THROTTLE_TTL: Joi.number().default(900000),
  AUTH_THROTTLE_LIMIT: Joi.number().default(100),

  // Stripe
  STRIPE_SECRET_KEY: Joi.string().optional(),
  STRIPE_WEBHOOK_SECRET: Joi.string().optional(),

  // 2FA
  TWO_FACTOR_APP_NAME: Joi.string().default('Monpsy'),

  // CORS
  CORS_ORIGINS: Joi.string().default('http://localhost:3002,http://localhost:3000'),

  // BullMQ
  BULL_REDIS_HOST: Joi.string().default('localhost'),
  BULL_REDIS_PORT: Joi.number().default(6379),
  BULL_REDIS_PASSWORD: Joi.string().allow('').default(''),

  // Jitsi Meet
  JITSI_DOMAIN: Joi.string().default('meet.jit.si'),
  JITSI_APP_ID: Joi.string().default('monpsy'),
  JITSI_APP_SECRET: Joi.string().min(32).default('jitsiappsecret1234567890jitsiappsecret'),
  JITSI_TOKEN_EXPIRY: Joi.number().default(7200),
});
