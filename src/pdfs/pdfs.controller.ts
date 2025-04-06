import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PdfsService } from './pdfs.service';

@Controller('pdfs')
export class PdfsController {
  constructor(private readonly pdfsService: PdfsService) {}
}
