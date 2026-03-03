import { sanitizeObjectForLog, sanitizeTextForLog } from './log-sanitizer.util';

describe('log sanitizer', () => {
  it('masks api key and password in plain text', () => {
    const text =
      'payload={"password":"secret123","x-api-key":"sk-tr-abcdefghijklmnopqrstuvwxyz"}';
    const sanitized = sanitizeTextForLog(text);

    expect(sanitized).not.toContain('secret123');
    expect(sanitized).not.toContain('sk-tr-abcdefghijklmnopqrstuvwxyz');
    expect(sanitized).toContain('"password":"***"');
    expect(sanitized).toContain('"x-api-key":"***"');
  });

  it('masks sensitive object fields recursively', () => {
    const sanitized = sanitizeObjectForLog({
      password: 'secret',
      nested: {
        apiKey: 'sk-tr-abcdefghijklmnop',
        tokenValue: 'abc',
      },
      normal: 'ok',
    }) as Record<string, unknown>;

    expect(sanitized.password).toBe('***');
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe('***');
    expect((sanitized.nested as Record<string, unknown>).tokenValue).toBe('***');
    expect(sanitized.normal).toBe('ok');
  });
});
