import { VertexAdapter } from './vertex.adapter';

describe('VertexAdapter', () => {
  let adapter: VertexAdapter;

  beforeEach(() => {
    adapter = new VertexAdapter();
  });

  afterEach(() => {
    delete process.env.VERTEX_BASE_URL;
    delete process.env.VERTEX_API_KEY;
  });

  it('transforms claude request into vertex request shape', () => {
    const mapped = adapter.transformRequest({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: 300,
      stream: false,
    });

    expect(mapped.model).toBe('claude-3-5-sonnet-20241022');
    expect(mapped.contents).toEqual([{ role: 'user', content: 'hello' }]);
    expect(mapped.generationConfig).toEqual({ maxOutputTokens: 300 });
  });

  it('transforms vertex usage metadata into claude usage shape', () => {
    const mapped = adapter.transformResponse({
      id: 'vertex-msg-1',
      model: 'claude-3-5-sonnet-20241022',
      candidates: [
        {
          content: [{ type: 'text', text: 'ok' }],
        },
      ],
      usageMetadata: {
        promptTokenCount: 9,
        candidatesTokenCount: 5,
      },
    });

    expect(mapped.id).toBe('vertex-msg-1');
    expect(mapped.content).toEqual([{ type: 'text', text: 'ok' }]);
    expect(mapped.usage).toEqual({
      input_tokens: 9,
      output_tokens: 5,
    });
  });

  it('health check is true when vertex base url and api key are configured', async () => {
    process.env.VERTEX_BASE_URL = 'https://vertex.example.com';
    process.env.VERTEX_API_KEY = 'test-vertex';

    await expect(adapter.healthCheck()).resolves.toBe(true);
  });
});
