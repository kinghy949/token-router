import { BedrockAdapter } from './bedrock.adapter';

describe('BedrockAdapter', () => {
  let adapter: BedrockAdapter;

  beforeEach(() => {
    adapter = new BedrockAdapter();
  });

  afterEach(() => {
    delete process.env.BEDROCK_BASE_URL;
    delete process.env.BEDROCK_API_KEY;
  });

  it('transforms claude request into bedrock request shape', () => {
    const mapped = adapter.transformRequest({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 256,
      stream: false,
    });

    expect(mapped.modelId).toBe('claude-3-5-sonnet-20241022');
    expect(mapped.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(mapped.max_tokens).toBe(256);
  });

  it('transforms bedrock response usage fields into claude shape', () => {
    const mapped = adapter.transformResponse({
      id: 'bedrock-msg-1',
      modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      output: {
        message: {
          content: [{ type: 'text', text: 'ok' }],
        },
      },
      usage: {
        inputTokens: 12,
        outputTokens: 6,
      },
    });

    expect(mapped.id).toBe('bedrock-msg-1');
    expect(mapped.content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(mapped.usage).toEqual({
      input_tokens: 12,
      output_tokens: 6,
    });
  });

  it('health check is true when bedrock base url and api key are configured', async () => {
    process.env.BEDROCK_BASE_URL = 'https://bedrock.example.com';
    process.env.BEDROCK_API_KEY = 'test-bedrock';

    await expect(adapter.healthCheck()).resolves.toBe(true);
  });
});
