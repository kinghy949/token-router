import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProvidersModule } from '../providers/providers.module';
import { ProxyController } from './proxy.controller';
import { ProxyExceptionFilter } from './proxy-exception.filter';
import { ProxyService } from './proxy.service';

@Module({
  imports: [ProvidersModule, BillingModule, AuthModule],
  controllers: [ProxyController],
  providers: [ProxyService, ProxyExceptionFilter],
  exports: [ProxyService],
})
export class ProxyModule {}
