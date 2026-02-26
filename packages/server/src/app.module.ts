import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvidersModule } from './providers/providers.module';
import { ProxyModule } from './proxy/proxy.module';
import { RedeemModule } from './redeem/redeem.module';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    BillingModule,
    ProxyModule,
    RedeemModule,
    ProvidersModule,
    AdminModule,
  ],
})
export class AppModule {}
