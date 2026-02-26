import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: Number(process.env.JWT_EXPIRES_IN_SECONDS || 604800) },
    }),
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, ApiKeyService, JwtStrategy],
  exports: [AuthService, ApiKeyService, JwtModule, PassportModule],
})
export class AuthModule {}
