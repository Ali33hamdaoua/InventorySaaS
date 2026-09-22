import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_NAME, BRAND_NAME } from './common/config/brand';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const port = Number(process.env.PORT ?? 3001);
  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const corsOrigin = process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'];
  const swaggerEnabled = (process.env.SWAGGER_ENABLED ?? 'true') === 'true';
  const swaggerPath = process.env.SWAGGER_PATH ?? 'docs';

  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    // Browsers hide custom response headers from JS unless we list them here.
    // Frontend reads Content-Disposition to recover the server-side filename
    // (otherwise every export saves as the hardcoded fallback).
    exposedHeaders: ['Content-Disposition'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle(`${APP_NAME} API`)
      .setDescription(`Inventory & food cost control API — ${BRAND_NAME}`)
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(swaggerPath, app, doc);
  }

  await app.listen(port);
  logger.log(`API ready on http://localhost:${port}/${apiPrefix}`);
  if (swaggerEnabled) {
    logger.log(`Swagger ready on http://localhost:${port}/${swaggerPath}`);
  }
}

void bootstrap();
