import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  getBalance(@CurrentUser() user: CurrentUserPayload) {
    return this.billingService.getBalance(user.userId);
  }
}
