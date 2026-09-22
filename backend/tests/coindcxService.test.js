const crypto = require('crypto');
const CoinDCXService = require('../src/services/coindcxService');

describe('CoinDCXService - Authentication & HMAC Signature', () => {
  const testApiKey = 'test_api_key_abc123';
  const testApiSecret = 'test_api_secret_xyz789';

  it('should accurately calculate HMAC-SHA256 signature using API Secret', () => {
    const service = new CoinDCXService({
      apiKey: testApiKey,
      apiSecret: testApiSecret,
    });

    const body = {
      timestamp: 1609459200000,
      market: 'BTCUSDT',
    };

    const expectedSignature = crypto
      .createHmac('sha256', testApiSecret)
      .update(JSON.stringify(body))
      .digest('hex');

    const generated = service.generateSignature(body);
    expect(generated).toBe(expectedSignature);
    expect(generated).toHaveLength(64); // SHA-256 is 64 hex characters
  });

  it('should generate valid CoinDCX authentication headers', () => {
    const service = new CoinDCXService({
      apiKey: testApiKey,
      apiSecret: testApiSecret,
    });

    const body = { timestamp: Date.now() };
    const headers = service.getAuthHeaders(body);

    expect(headers['X-AUTH-APIKEY']).toBe(testApiKey);
    expect(typeof headers['X-AUTH-SIGNATURE']).toBe('string');
    expect(headers['X-AUTH-SIGNATURE']).toHaveLength(64);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should throw an error when attempting to sign without an API secret', () => {
    const unauthedService = new CoinDCXService({
      apiKey: 'some_key',
      apiSecret: '',
    });

    expect(() => {
      unauthedService.generateSignature({ test: true });
    }).toThrow('CoinDCX API Secret is required to generate signature');
  });
});
