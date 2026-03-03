import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AdjustUserBalanceDto } from './dto/adjust-user-balance.dto';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';
import { ListRedeemCodesDto } from './dto/list-redeem-codes.dto';
import { ListUsageLogsDto } from './dto/list-usage-logs.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(@Query() query: ListUsersDto) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUserDetail(@Param('id') userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(user.userId, userId, dto);
  }

  @Patch('users/:id/balance')
  adjustUserBalance(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') userId: string,
    @Body() dto: AdjustUserBalanceDto,
  ) {
    return this.adminService.adjustUserBalance(user.userId, userId, dto);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Post('redeem-codes')
  createRedeemCodes(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRedeemCodesDto) {
    return this.adminService.createRedeemCodes(user.userId, dto);
  }

  @Get('redeem-codes')
  listRedeemCodes(@Query() query: ListRedeemCodesDto) {
    return this.adminService.listRedeemCodes(query);
  }

  @Get('usage-logs')
  listUsageLogs(@Query() query: ListUsageLogsDto) {
    return this.adminService.listUsageLogs(query);
  }
}
