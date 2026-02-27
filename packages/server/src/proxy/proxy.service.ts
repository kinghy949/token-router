import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class ProxyService {
  async forwardMessage() {
    throw new NotImplementedException('Proxy forwarding is not implemented yet');
  }
}
