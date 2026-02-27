import { Controller, Get, HttpCode } from '@nestjs/common';
import { AdminService } from './admin.service';

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
}
