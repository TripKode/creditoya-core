import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as responseTime from "response-time"
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(responseTime());
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  })
  app.use(cookieParser());
  await app.listen(3000);
  // const port = process.env.PORT || 8080;
  // await app.listen(port, "0.0.0.0");
}
bootstrap();