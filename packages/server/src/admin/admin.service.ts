import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class AdminService {
  async listUsers() {
    throw new NotImplementedException('Admin module is not implemented yet');
  }
}
