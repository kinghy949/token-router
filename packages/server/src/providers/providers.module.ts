import { Module } from '@nestjs/common';
import { AnthropicAdapter } from './anthropic.adapter';
import { BedrockAdapter } from './bedrock.adapter';
import { VertexAdapter } from './vertex.adapter';

@Module({
  providers: [AnthropicAdapter, BedrockAdapter, VertexAdapter],
  exports: [AnthropicAdapter, BedrockAdapter, VertexAdapter],
})
export class ProvidersModule {}
