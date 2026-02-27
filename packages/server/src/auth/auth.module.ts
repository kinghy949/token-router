import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: jwtExpiresIn },
    }),
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [AuthService, ApiKeyService, JwtStrategy],
  exports: [AuthService, ApiKeyService, JwtModule, PassportModule],
})
export class AuthModule {}
