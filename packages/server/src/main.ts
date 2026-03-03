import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttpApp } from './common/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttpApp(app);

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
}

bootstrap();
