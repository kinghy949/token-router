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
export class VertexAdapter implements ProviderAdapter {
  name = 'vertex';

  transformRequest(_req: ClaudeRequest): ProviderRequest {
    throw new NotImplementedException('Vertex adapter transformRequest not implemented');
  }

  transformResponse(_res: ProviderResponse): ClaudeResponse {
    throw new NotImplementedException('Vertex adapter transformResponse not implemented');
  }

  streamResponse(_res: ProviderStream): AsyncIterable<ClaudeStreamEvent> {
    throw new NotImplementedException('Vertex adapter streamResponse not implemented');
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }

  supportedModels(): string[] {
    return [];
  }
}
