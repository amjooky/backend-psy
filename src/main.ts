import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import * as compression from 'compression';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { InvoiceService } from './modules/payments/invoice.service';
import { PrismaService } from './database/prisma.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') || 3000;
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';
  const nodeEnv = configService.get<string>('app.nodeEnv') || 'development';

  // ─── Serve Local Uploads Statically ─────────────────────────
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

  // Dynamic invoice PDF recovery for ephemeral storage container restarts
  app.use('/uploads/invoices', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const filename = req.path.replace(/^\//, '');
      const invoiceService = app.get(InvoiceService);
      const prisma = app.get(PrismaService);

      const invoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { pdfUrl: { contains: filename } },
            { id: filename.replace('.pdf', '') },
          ],
        },
      });

      if (invoice) {
        await invoiceService.generateInvoicePdf(invoice.id);
        const candidatePath = path.join(uploadsDir, 'invoices', filename);
        if (fs.existsSync(candidatePath)) {
          return res.sendFile(candidatePath);
        }
        const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
        if (updated?.pdfUrl) {
          const rel = updated.pdfUrl.split('/uploads/invoices/')[1];
          if (rel && fs.existsSync(path.join(uploadsDir, 'invoices', rel))) {
            return res.sendFile(path.join(uploadsDir, 'invoices', rel));
          }
        }
      }
    } catch {
      // ignore
    }
    next();
  });
  const rawCorsOrigins = configService.get<any>('CORS_ORIGINS') || configService.get<any>('cors.origins') || '';
  const corsOriginsArray = Array.isArray(rawCorsOrigins)
    ? rawCorsOrigins
    : typeof rawCorsOrigins === 'string'
      ? rawCorsOrigins.split(',').map((s) => s.trim())
      : [];
  const frontendUrl = configService.get<string>('app.frontendUrl') || '';

  // ─── Global Prefix ──────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix);

  // ─── Security: Helmet ───────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production' ? false : false,
      crossOriginEmbedderPolicy: false,
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
      const allowedOrigins = [...corsOriginsArray, frontendUrl].filter(Boolean);
      const isAllowed = allowedOrigins.some((origin) => {
        if (origin === requestOrigin) return true;
        if (origin.replace(/\/$/, '') === requestOrigin.replace(/\/$/, '')) return true;
        return false;
      });

      if (
        isAllowed ||
        requestOrigin.endsWith('.educanet.pro') ||
        requestOrigin.endsWith('.vercel.app') ||
        requestOrigin.includes('vercel.app') ||
        requestOrigin.endsWith('.onrender.com') ||
        nodeEnv !== 'production'
      ) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked for origin: ${requestOrigin}`);
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
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
