import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeStreamEvent,
  ProviderAdapter,
  ProviderRequest,
  ProviderResponse,
  ProviderStream,
} from './provider-adapter.interface';

@Injectable()
export class BedrockAdapter implements ProviderAdapter {
  name = 'bedrock';

  transformRequest(_req: ClaudeRequest): ProviderRequest {
    throw new NotImplementedException('Bedrock adapter transformRequest not implemented');
  }

  transformResponse(_res: ProviderResponse): ClaudeResponse {
    throw new NotImplementedException('Bedrock adapter transformResponse not implemented');
  }

  streamResponse(_res: ProviderStream): AsyncIterable<ClaudeStreamEvent> {
    throw new NotImplementedException('Bedrock adapter streamResponse not implemented');
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }

  supportedModels(): string[] {
    return [];
  }
}
