import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RedeemDto } from './dto/redeem.dto';
import { RedeemService } from './redeem.service';

@Controller('redeem')
export class RedeemController {
  constructor(private readonly redeemService: RedeemService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  redeem(@CurrentUser() user: CurrentUserPayload, @Body() dto: RedeemDto) {
    return this.redeemService.redeemCode(user.userId, dto.code);
  }
}
