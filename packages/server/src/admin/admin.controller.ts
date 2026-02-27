import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';
import { ListRedeemCodesDto } from './dto/list-redeem-codes.dto';
import { ListUsageLogsDto } from './dto/list-usage-logs.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @HttpCode(501)
  async listUsers() {
    try {
      await this.adminService.listUsers();
    } catch {
      return {
        error: {
          type: 'not_implemented_error',
          message: '管理员模块暂未实现',
        },
      };
    }
  }

  @Post('redeem-codes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createRedeemCodes(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRedeemCodesDto) {
    return this.adminService.createRedeemCodes(user.userId, dto);
  }

  @Get('redeem-codes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  listRedeemCodes(@Query() query: ListRedeemCodesDto) {
    return this.adminService.listRedeemCodes(query);
  }

  @Get('usage-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  listUsageLogs(@Query() query: ListUsageLogsDto) {
    return this.adminService.listUsageLogs(query);
  }
}
