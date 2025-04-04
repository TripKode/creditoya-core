import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CatchService } from './catch.service';
import { CreateCatchDto } from './dto/create-catch.dto';
import { UpdateCatchDto } from './dto/update-catch.dto';

@Controller('catch')
export class CatchController {
  constructor(private readonly catchService: CatchService) {}
}
