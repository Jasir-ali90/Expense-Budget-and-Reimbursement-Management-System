const request = require('supertest');
const app = require('../app');

/**
 * Smoke tests: the API boots, answers the health probe and returns the
 * uniform error envelope for unknown routes.
 */
describe('API bootstrap', () => {
  it('GET /api/health reports the service status', async () => {
    const response = await request(app).get('/api/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('expense-budget-reimbursement-api');
    expect(response.body.data.database).toHaveProperty('name');
  });

  it('returns the standard 404 envelope for unknown routes', async () => {
    const response = await request(app).get('/api/this-route-does-not-exist').expect(404);

    expect(response.body).toMatchObject({ success: false });
    expect(typeof response.body.message).toBe('string');
  });

  it('rejects malformed JSON with a 400 error envelope', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.success).toBe(false);
  });
});
