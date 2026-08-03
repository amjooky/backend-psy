import { UserRole } from '@prisma/client';

export const ROLES = UserRole;

export const ADMIN_ROLES = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
export const ALL_ROLES = Object.values(UserRole);

export const CACHE_KEYS = {
  USER: (id: string) => `user:${id}`,
  PATIENT: (id: string) => `patient:${id}`,
  PSYCHOLOGIST: (id: string) => `psychologist:${id}`,
  PSYCHOLOGIST_LIST: (page: number, limit: number, filters: string) =>
    `psychologists:${page}:${limit}:${filters}`,
  REFRESH_TOKEN: (userId: string) => `refresh:${userId}`,
  EMAIL_VERIFY: (userId: string) => `email-verify:${userId}`,
  RESET_PASSWORD: (token: string) => `reset-pwd:${token}`,
  TWO_FACTOR: (userId: string) => `2fa:${userId}`,
  APPOINTMENT_SLOTS: (psychologistId: string, date: string) =>
    `slots:${psychologistId}:${date}`,
} as const;

export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  APPOINTMENT_REMINDERS: 'appointment-reminders',
  INVOICE_GENERATION: 'invoice-generation',
  PAYMENT_PROCESSING: 'payment-processing',
} as const;

export const JWT_STRATEGY = {
  ACCESS: 'jwt',
  REFRESH: 'jwt-refresh',
} as const;

export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: 5 * 1024 * 1024,        // 5MB
  PDF_MAX_SIZE: 10 * 1024 * 1024,          // 10MB
  AUDIO_MAX_SIZE: 50 * 1024 * 1024,        // 50MB
  CERTIFICATE_MAX_SIZE: 10 * 1024 * 1024,  // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf'],
  ALLOWED_AUDIO_TYPES: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'],
} as const;
