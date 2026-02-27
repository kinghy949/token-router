import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { CreateRedeemCodesDto } from './dto/create-redeem-codes.dto';

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
          message: 'Admin module is not implemented yet',
        },
      };
    }
  }

  @Post('redeem-codes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createRedeemCodes(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRedeemCodesDto) {
    return this.adminService.createRedeemCodes(user.userId, dto);
  }
}
