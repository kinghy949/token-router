import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class RedeemService {
  async redeemCode() {
    throw new NotImplementedException('Redeem module is not implemented yet');
  }
}
