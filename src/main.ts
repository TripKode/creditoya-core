import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // await app.listen(3000);
  const port = process.env.PORT || 8080;
  await app.listen(port, "0.0.0.0");
}
bootstrap();