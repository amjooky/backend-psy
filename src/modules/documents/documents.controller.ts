import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FILE_LIMITS } from '../../common/constants/app.constants';

const ALLOWED_DOCUMENT_TYPES = [
  ...FILE_LIMITS.ALLOWED_IMAGE_TYPES,
  ...FILE_LIMITS.ALLOWED_DOCUMENT_TYPES,
] as string[];

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: FILE_LIMITS.PDF_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Unsupported file type. Allowed: images and PDFs.'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (PDF or image)' })
  async uploadDocument(
    @CurrentUser('sub') userId: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided.');
    }

    const { filename, url } = await this.documentsService.uploadFile(
      file,
      'documents',
    );

    const record = await this.documentsService.saveRecord(userId, {
      filename,
      originalName: file.originalname,
      url,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });

    return record;
  }

  @Get()
  @ApiOperation({ summary: 'List all documents uploaded by the current user' })
  async listDocuments(@CurrentUser('sub') userId: string) {
    return this.documentsService.listByUser(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document by ID' })
  async deleteDocument(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentsService.deleteRecord(userId, id);
  }
}
