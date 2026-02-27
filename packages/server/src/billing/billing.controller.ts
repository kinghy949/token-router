import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { GetUsageDto } from './dto/get-usage.dto';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('balance')
  @UseGuards(JwtAuthGuard)
  getBalance(@CurrentUser() user: CurrentUserPayload) {
    return this.billingService.getBalance(user.userId);
  }

  @Get('transactions')
  @UseGuards(JwtAuthGuard)
  getTransactions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: GetTransactionsDto,
  ) {
    return this.billingService.getTransactions(user.userId, query);
  }

  @Get('usage')
  @UseGuards(JwtAuthGuard)
  getUsage(@CurrentUser() user: CurrentUserPayload, @Query() query: GetUsageDto) {
    return this.billingService.getUsage(user.userId, query);
  }
}
