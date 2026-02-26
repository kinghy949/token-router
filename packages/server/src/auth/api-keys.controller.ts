import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateApiKeyDto) {
    return this.apiKeyService.createApiKey(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.apiKeyService.listApiKeys(user.userId);
  }
}
