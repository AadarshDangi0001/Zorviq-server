import jwt from 'jsonwebtoken';
import type { Express } from 'express';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import userModel, { type UserDocument } from '../../src/models/User.model.js';
import { Project } from '../../src/models/Project.model.js';

let app: Express;
let mongo: MongoMemoryServer;

const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';

const makeAuthToken = (user: UserDocument): string =>
  jwt.sign({ id: String(user._id) }, jwtSecret, { expiresIn: '1h' });

const createVerifiedUser = async (email: string): Promise<UserDocument> => {
  return userModel.create({
    email,
    password: 'Password123',
    fullname: 'Verified User',
    verified: true,
  });
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', port: 27019 },
  });
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await mongoose.connection.db?.dropDatabase();
});

describe('GitHub integration', () => {
  it('returns disconnected status for a user without GitHub linked', async () => {
    const user = await createVerifiedUser('github-status@example.com');
    const token = makeAuthToken(user);

    const response = await request(app)
      .get('/api/github/status')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.githubConnected).toBe(false);
    expect(response.body.data.githubUsername).toBeUndefined();
  });

  it('rejects repository creation when GitHub is not connected', async () => {
    const user = await createVerifiedUser('github-deploy@example.com');
    const token = makeAuthToken(user);
    const project = await Project.create({
      userId: user._id,
      name: 'Deploy Me',
      currentCode: '<main class="p-4">Hello</main>',
    });

    const response = await request(app)
      .post(`/api/github/repos/${String(project._id)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/connect your github account/i);
  });

  it('redirects authenticated users to GitHub OAuth authorize URL', async () => {
    const user = await createVerifiedUser('github-connect@example.com');
    const token = makeAuthToken(user);

    const response = await request(app)
      .get('/api/github/connect')
      .query({ returnTo: '/projects/abc' })
      .set('Authorization', `Bearer ${token}`)
      .expect(302);

    expect(response.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(response.headers.location).toContain('client_id=test-github-client-id');
    expect(response.headers.location).toContain('scope=repo');
  });
});
