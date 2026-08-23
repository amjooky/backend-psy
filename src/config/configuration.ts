export default () => ({
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    url: process.env.APP_URL,
    frontendUrl: process.env.FRONTEND_URL,
    apiPrefix: process.env.API_PREFIX || 'api/v1',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    tls: process.env.REDIS_TLS === 'true',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    emailVerifySecret: process.env.JWT_EMAIL_VERIFY_SECRET,
    emailVerifyExpiry: process.env.JWT_EMAIL_VERIFY_EXPIRY || '24h',
    resetPasswordSecret: process.env.JWT_RESET_PASSWORD_SECRET,
    resetPasswordExpiry: process.env.JWT_RESET_PASSWORD_EXPIRY || '1h',
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
    bucketName: process.env.MINIO_BUCKET_NAME || 'monpsy',
    publicUrl: process.env.MINIO_PUBLIC_URL,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.SMTP_FROM_NAME || 'Monpsy',
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    authTtl: parseInt(process.env.AUTH_THROTTLE_TTL || '900000', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT || '10', 10),
  },
  payments: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    konnect: {
      apiKey: process.env.KONNECT_API_KEY,
      apiUrl: process.env.KONNECT_API_URL,
    },
    flouci: {
      appToken: process.env.FLOUCI_APP_TOKEN,
      appSecret: process.env.FLOUCI_APP_SECRET,
    },
    paymee: {
      apiKey: process.env.PAYMEE_API_KEY,
      apiUrl: process.env.PAYMEE_API_URL,
    },
  },
  twoFactor: {
    appName: process.env.TWO_FACTOR_APP_NAME || 'Monpsy',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()),
  },
  bull: {
    redis: {
      host: process.env.BULL_REDIS_HOST || 'localhost',
      port: parseInt(process.env.BULL_REDIS_PORT || '6379', 10),
      password: process.env.BULL_REDIS_PASSWORD,
    },
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  jitsi: {
    domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
    appId: process.env.JITSI_APP_ID || 'monpsy',
    appSecret: process.env.JITSI_APP_SECRET || 'jitsiappsecret1234567890jitsiappsecret',
    tokenExpiry: parseInt(process.env.JITSI_TOKEN_EXPIRY || '7200', 10), // Default 2 hours
  },
});
