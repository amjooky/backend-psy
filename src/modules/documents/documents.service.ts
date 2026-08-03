import { Injectable, Logger, OnModuleInit, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService implements OnModuleInit {
  private minioClient!: Minio.Client;
  private readonly logger = new Logger(DocumentsService.name);
  private bucketName!: string;
  private uploadsDir = path.join(process.cwd(), 'uploads');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.bucketName = this.config.get<string>('minio.bucketName') || 'monpsy';
    this.minioClient = new Minio.Client({
      endPoint: this.config.get<string>('minio.endpoint') || 'localhost',
      port: this.config.get<number>('minio.port') || 9000,
      useSSL: this.config.get<boolean>('minio.useSSL') || false,
      accessKey: this.config.get<string>('minio.accessKey') || 'minioadmin',
      secretKey: this.config.get<string>('minio.secretKey') || 'minioadmin',
    });

    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket "${this.bucketName}" created successfully.`);
      }
    } catch (err: any) {
      this.logger.warn(`MinIO Connection/Bucket Initialization failed, local fallback enabled: ${err.message}`);
    }
  }

  async uploadFile(
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    pathPrefix: string = 'documents',
  ): Promise<{ filename: string; url: string }> {
    const extension = file.originalname.split('.').pop() || '';
    const fileId = uuidv4();
    const uniqueFilename = `${pathPrefix}/${fileId}.${extension}`;

    try {
      await this.minioClient.putObject(
        this.bucketName,
        uniqueFilename,
        file.buffer,
        file.size,
        { 'Content-Type': file.mimetype },
      );

      const publicUrl = this.config.get<string>('minio.publicUrl') || 'http://localhost:9000';
      return {
        filename: file.originalname,
        url: `${publicUrl}/${this.bucketName}/${uniqueFilename}`,
      };
    } catch (err: any) {
      this.logger.warn(`MinIO putObject failed (${err.message}). Saving file to local fallback storage.`);
      const subDir = path.join(this.uploadsDir, pathPrefix);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }
      const localFileName = `${fileId}.${extension}`;
      const localFilePath = path.join(subDir, localFileName);
      fs.writeFileSync(localFilePath, file.buffer);

      const serverPort = this.config.get<number>('PORT') || 3000;
      return {
        filename: file.originalname,
        url: `http://localhost:${serverPort}/uploads/${pathPrefix}/${localFileName}`,
      };
    }
  }

  async deleteFile(objectName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(this.bucketName, objectName);
    } catch (err: any) {
      this.logger.warn(`Failed to delete object "${objectName}" from MinIO: ${err.message}`);
      // Fallback local cleanup
      const localPath = path.join(this.uploadsDir, objectName);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
  }

  /** Persist a document upload record in the database */
  async saveRecord(userId: string, data: {
    filename: string;
    originalName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    isPublic?: boolean;
    metadata?: any;
  }) {
    return this.prisma.document.create({
      data: {
        userId,
        filename: data.filename,
        originalName: data.originalName,
        url: data.url,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        isPublic: data.isPublic ?? false,
        metadata: data.metadata ?? null,
      },
    });
  }

  /** List all documents belonging to a user */
  async listByUser(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Delete document record from DB and object from MinIO */
  async deleteRecord(userId: string, documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found.');
    if (doc.userId !== userId) throw new ForbiddenException('Access denied.');

    // Extract MinIO object name from URL: <publicUrl>/<bucket>/<objectName>
    const urlParts = doc.url.split(`/${this.bucketName}/`);
    if (urlParts.length > 1) {
      await this.deleteFile(urlParts[1]);
    }

    await this.prisma.document.delete({ where: { id: documentId } });
    return { success: true };
  }
}

