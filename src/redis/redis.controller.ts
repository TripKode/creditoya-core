import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CreateRediDto } from './dto/create-redi.dto';
import { UpdateRediDto } from './dto/update-redi.dto';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}
}
