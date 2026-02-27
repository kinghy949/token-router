import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { RedeemService } from './redeem.service';

@Controller('redeem')
export class RedeemController {
  constructor(private readonly redeemService: RedeemService) {}

  @Post()
  @HttpCode(501)
  async redeem(@Body() body: unknown) {
    try {
      await this.redeemService.redeemCode();
    } catch {
      return {
        error: {
          type: 'not_implemented_error',
          message: 'Redeem module is not implemented yet',
        },
        body,
      };
    }
  }
}
