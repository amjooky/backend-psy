import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';
  const nodeEnv = configService.get<string>('app.nodeEnv') || 'development';
  const corsOrigins = configService.get<string[]>('cors.origins') || [];
  const frontendUrl = configService.get<string>('app.frontendUrl') || '';

  // ─── Global Prefix ──────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);

  // ─── Security: Helmet ───────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
      crossOriginEmbedderPolicy: nodeEnv === 'production',
    }),
  );

  // ─── Compression ────────────────────────────────────────────
  app.use(compression());

  // ─── Cookie Parser ──────────────────────────────────────────
  app.use(cookieParser());

  // ─── CORS ───────────────────────────────────────────────────
  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      const allowedOrigins = [...corsOrigins, frontendUrl].filter(Boolean);
      const isAllowed = allowedOrigins.some((origin) => {
        if (origin === requestOrigin) return true;
        if (origin.replace(/\/$/, '') === requestOrigin.replace(/\/$/, '')) return true;
        return false;
      });

      if (isAllowed || requestOrigin.endsWith('.educanet.pro') || nodeEnv !== 'production') {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked for origin: ${requestOrigin}`);
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  });

  // ─── Global Validation Pipe ─────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip unknown properties
      forbidNonWhitelisted: true,// Throw on unknown properties
      transform: true,           // Auto-transform to DTO types
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: false,   // Collect all errors
    }),
  );

  // ─── Class Serializer (excludes @Exclude() fields) ──────────
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // ─── Swagger / OpenAPI ──────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Monpsy API')
      .setDescription(
        `
## Monpsy — Online Psychotherapy Platform API

Production-ready REST API for connecting patients with licensed psychologists.

### Authentication
All endpoints except those marked **Public** require a **Bearer JWT token**.

Use \`POST /api/v1/auth/login\` to obtain tokens, then include:
\`Authorization: Bearer <access_token>\`

### Rate Limiting
- Default: 100 requests per minute
- Auth endpoints: 10 requests per 15 minutes

### Response Format
All responses follow the standard envelope:
\`\`\`json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
\`\`\`
      `,
      )
      .setVersion('1.0.0')
      .setContact('Monpsy Team', 'https://monpsy.tn', 'api@monpsy.tn')
      .setLicense('Proprietary', '')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'User registration, login, token management')
      .addTag('Patients', 'Patient profile, favorites, questionnaire')
      .addTag('Psychologists', 'Psychologist profiles, availability, certificates')
      .addTag('Health', 'System health checks')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'Monpsy API Docs',
    });

    logger.log(`📖 Swagger: http://localhost:${port}/${apiPrefix}/docs`);
  }

  // ─── Graceful Shutdown ──────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Monpsy Backend running on port ${port}`);
  logger.log(`🌍 Environment: ${nodeEnv}`);
  logger.log(`📍 API: http://localhost:${port}/${apiPrefix}`);
  logger.log(`❤️  Health: http://localhost:${port}/${apiPrefix}/health`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Failed to start application', err);
  process.exit(1);
});
