import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { BedrockAdapter } from './bedrock.adapter';
import { ProviderRegistryService } from './provider-registry.service';
import { VertexAdapter } from './vertex.adapter';

@Module({
  providers: [AnthropicAdapter, BedrockAdapter, VertexAdapter, ProviderRegistryService],
  exports: [AnthropicAdapter, BedrockAdapter, VertexAdapter, ProviderRegistryService],
})
export class ProvidersModule {}
