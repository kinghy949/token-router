import { INestApplication, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

export function configureHttpApp(app: INestApplication) {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const bodyLimit = process.env.REQUEST_BODY_LIMIT?.trim() || '10mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  const allowlist = parseWebOrigins(process.env.WEB_URL);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
}

function parseWebOrigins(rawValue: string | undefined): string[] {
  const source = rawValue?.trim() || 'http://localhost:8080';
  return source
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
