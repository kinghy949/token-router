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
    throw new NotImplementedException('Vertex 适配器 transformRequest 暂未实现');
  }

  transformResponse(_res: ProviderResponse): ClaudeResponse {
    throw new NotImplementedException('Vertex 适配器 transformResponse 暂未实现');
  }

  streamResponse(_res: ProviderStream): AsyncIterable<ClaudeStreamEvent> {
    throw new NotImplementedException('Vertex 适配器 streamResponse 暂未实现');
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }

  supportedModels(): string[] {
    return [];
  }
}
