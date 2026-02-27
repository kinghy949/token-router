import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ProvidersModule } from '../providers/providers.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [ProvidersModule, BillingModule],
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
