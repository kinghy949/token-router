export interface ClaudeRequest {
  model: string;
  messages: unknown[];
  max_tokens?: number;
  stream?: boolean;
}

export interface ClaudeResponse {
  id?: string;
  model?: string;
  content?: unknown[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ProviderRequest {
  [key: string]: unknown;
}

export interface ProviderResponse {
  [key: string]: unknown;
}

export interface ProviderStream {
  [key: string]: unknown;
}

export interface ClaudeStreamEvent {
  type: string;
  [key: string]: unknown;
}

export interface ProviderAdapter {
  name: string;
  transformRequest(req: ClaudeRequest): ProviderRequest;
  transformResponse(res: ProviderResponse): ClaudeResponse;
  streamResponse(res: ProviderStream): AsyncIterable<ClaudeStreamEvent>;
  healthCheck(): Promise<boolean>;
  supportedModels(): string[];
  forwardMessages(
    request: ClaudeRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response>;
  forwardCountTokens(
    request: ProviderRequest,
    incomingHeaders: Record<string, string | string[] | undefined>,
  ): Promise<Response>;
}
