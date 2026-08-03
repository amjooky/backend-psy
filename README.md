# Monpsy Backend

> Production-ready NestJS backend for an online psychotherapy platform.

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| File Storage | MinIO (S3-compatible) |
| Auth | JWT (access + refresh) + bcrypt + 2FA (TOTP) |
| Real-time | Socket.io |
| Job Queue | BullMQ |
| API Docs | Swagger / OpenAPI |
| Containerization | Docker + Docker Compose |

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20
- Docker & Docker Compose
- npm >= 10

### 1. Clone and install
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your secrets
```

### 3. Start infrastructure
```bash
# Start PostgreSQL, Redis, MinIO
docker-compose up -d postgres redis minio

# Or start everything including the app
docker-compose up -d
```

### 4. Run migrations
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start development server
```bash
npm run start:dev
```

### 6. Open API Docs
```
http://localhost:3000/api/v1/docs
```

## 🏗 Architecture

```
src/
├── common/                 # Shared guards, filters, interceptors, decorators
│   ├── decorators/         # @CurrentUser, @Roles, @Public, @SkipThrottle
│   ├── filters/            # AllExceptionsFilter (HTTP + Prisma errors)
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── interceptors/       # TransformInterceptor, LoggingInterceptor
│   ├── dto/                # PaginationDto, PaginatedResponseDto
│   ├── utils/              # CryptoUtil (AES-256), pagination utils
│   └── constants/          # Cache keys, queue names, roles
├── config/                 # Typed configuration + Joi validation
├── database/               # PrismaService + DatabaseModule
├── redis/                  # RedisService + RedisModule
└── modules/
    ├── auth/               # JWT auth, refresh tokens, 2FA, email verify
    ├── patients/           # Patient profile, questionnaire, favorites
    ├── psychologists/      # Profile, specialties, certs, availability
    └── health/             # Health check endpoint
```

## 🔐 Security

- **JWT**: Access tokens (15min) + Refresh tokens (7 days, rotated on use)
- **bcrypt**: Password hashing with cost factor 12
- **2FA**: TOTP (speakeasy) with QR code generation
- **Encryption**: AES-256 for sensitive fields (2FA secrets, medical data)
- **Helmet**: HTTP security headers
- **Rate Limiting**: 100 req/min globally, 10 req/15min on auth routes
- **Validation**: whitelist + forbidNonWhitelisted on all DTOs
- **CORS**: Strict origin whitelist
- **Audit Logs**: All state-changing operations logged

## 📡 API Endpoints

| Group | Endpoints |
|-------|-----------|
| Auth | POST /auth/register/patient, /auth/register/psychologist, /auth/login, /auth/logout, /auth/logout/all, /auth/refresh, /auth/verify-email, /auth/forgot-password, /auth/reset-password, /auth/change-password, GET /auth/2fa/setup, POST /auth/2fa/enable, /auth/2fa/disable |
| Patients | GET /patients/me, PATCH /patients/me, PATCH /patients/me/questionnaire, GET/POST/DELETE /patients/me/favorites/:id, GET /patients (admin), GET /patients/:id (admin) |
| Psychologists | GET /psychologists, GET /psychologists/:id, GET/PATCH /psychologists/me/profile, PUT /psychologists/me/specialties, POST/DELETE /psychologists/me/certificates/:id, PUT /psychologists/me/availability, PATCH /psychologists/me/vacation, GET /psychologists/admin/all, POST /psychologists/admin/:id/verify, POST /psychologists/admin/:id/suspend |
| Health | GET /health |

## 🐳 Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| postgres | 5432 | PostgreSQL database |
| redis | 6379 | Cache + job queue |
| minio | 9000, 9001 | Object storage + console |
| backend | 3000 | NestJS API |

Optional (via `--profile tools`):
| pgadmin | 5050 | PostgreSQL GUI |
| redis-insight | 8001 | Redis GUI |

## 🧪 Running Tests
```bash
npm test                # Unit tests
npm run test:e2e        # E2E tests
npm run test:cov        # Coverage report
```
