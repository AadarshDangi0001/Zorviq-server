import crypto from 'crypto';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import userModel, { type UserDocument } from '../../src/models/User.model.js';
import { Project } from '../../src/models/Project.model.js';
import { handleGoogleAuth } from '../../src/services/auth.service.js';

let app: Express;
let mongo: MongoMemoryServer;
type GoogleProfileInput = Parameters<typeof handleGoogleAuth>[0];

const jwtSecret = process.env.JWT_SECRET ?? 'test-jwt-secret';

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const makeAuthToken = (user: UserDocument): string =>
  jwt.sign({ id: String(user._id) }, jwtSecret, { expiresIn: '1h' });

const registerPayload = (email = 'user@example.com') => ({
  email,
  contact: '9876543210',
  password: 'Password123',
  fullname: 'Test User',
});

const verifyEmail = async (email: string) => {
  const token = jwt.sign({ email }, jwtSecret, { expiresIn: '1h' });

  await request(app)
    .get('/api/auth/verify-email')
    .query({ token })
    .expect(302)
    .expect('Location', 'http://localhost:8080/login');
};

const createVerifiedUser = async (
  email: string,
  password = 'Password123'
): Promise<UserDocument> => {
  return userModel.create({
    email,
    password,
    fullname: 'Verified User',
    contact: '9876543210',
    verified: true,
  });
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', port: 27018 },
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

describe('authentication validation', () => {
  it('registers a user, hashes the password, and rejects duplicate email', async () => {
    const payload = registerPayload();

    const response = await request(app).post('/api/auth/register').send(payload).expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(payload.email);
    expect(response.body.data.user.password).toBeUndefined();

    const storedUser = await userModel.findOne({ email: payload.email }).select('+password').exec();

    expect(storedUser).toBeTruthy();
    expect(storedUser?.verified).toBe(false);
    expect(storedUser?.password).toBeDefined();
    expect(storedUser?.password).not.toBe(payload.password);
    await expect(storedUser?.comparePassword(payload.password)).resolves.toBe(true);

    await request(app).post('/api/auth/register').send(payload).expect(400);
  });

  it('logs in verified users, rejects invalid credentials, and authorizes protected endpoints', async () => {
    const payload = registerPayload('login@example.com');

    await request(app).post('/api/auth/register').send(payload).expect(201);
    await request(app)
      .post('/api/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(403);

    await verifyEmail(payload.email);

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    const token = loginResponse.body.data.token;
    expect(token).toEqual(expect.any(String));
    expect(jwt.verify(token, jwtSecret)).toMatchObject({ id: expect.any(String) });

    await request(app)
      .post('/api/auth/login')
      .send({ email: payload.email, password: 'wrong-password' })
      .expect(401);

    await request(app).get('/api/auth/get-me').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('resets passwords, rejects expired tokens, and invalidates the old password', async () => {
    const user = await createVerifiedUser('reset@example.com', 'OldPassword123');
    const expiredToken = 'expired-reset-token';

    user.resetPasswordToken = hashToken(expiredToken);
    user.resetPasswordExpire = new Date(Date.now() - 1000);
    await user.save();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: expiredToken, newPassword: 'NewPassword123' })
      .expect(400);

    const validToken = 'valid-reset-token';
    user.resetPasswordToken = hashToken(validToken);
    user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: validToken, newPassword: 'NewPassword123' })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'OldPassword123' })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'NewPassword123' })
      .expect(200);
  });

  it('creates and reuses Google OAuth users through the auth service', async () => {
    const profile = {
      id: 'google-profile-1',
      displayName: 'Google User',
      emails: [{ value: 'google@example.com' }],
    };

    const created = await handleGoogleAuth(profile as GoogleProfileInput);
    expect(created.token).toEqual(expect.any(String));
    expect(created.user.email).toBe('google@example.com');
    expect(created.user.verified).toBe(true);

    const reused = await handleGoogleAuth({
      ...profile,
      displayName: 'Changed Name',
    } as GoogleProfileInput);

    expect(reused.user.id.toString()).toBe(created.user.id.toString());
    expect(await userModel.countDocuments({ email: 'google@example.com' })).toBe(1);
  });
});

describe('project management validation', () => {
  it('creates, reads, updates, and deletes projects for the owner', async () => {
    const user = await createVerifiedUser('owner@example.com');
    const token = makeAuthToken(user);

    const createResponse = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Landing Page', currentCode: '<html></html>' })
      .expect(201);

    const projectId = createResponse.body.data._id;
    expect(createResponse.body.data.userId).toBe(String(user._id));

    await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const updateResponse = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Landing Page', currentCode: '<main></main>' })
      .expect(200);

    expect(updateResponse.body.data.name).toBe('Updated Landing Page');
    expect(updateResponse.body.data.currentCode).toBe('<main></main>');

    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    expect(await Project.findById(projectId)).toBeNull();
  });

  it("prevents users from reading, updating, or deleting another user's project", async () => {
    const owner = await createVerifiedUser('project-owner@example.com');
    const attacker = await createVerifiedUser('project-attacker@example.com');
    const ownerToken = makeAuthToken(owner);
    const attackerToken = makeAuthToken(attacker);

    const createResponse = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Private Project' })
      .expect(201);

    const projectId = createResponse.body.data._id;

    await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(404);

    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ name: 'Stolen Project' })
      .expect(404);

    await request(app)
      .delete(`/api/projects/${projectId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(404);

    expect(await Project.findById(projectId)).toBeTruthy();
  });
});
