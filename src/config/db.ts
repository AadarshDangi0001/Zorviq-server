import mongoose from 'mongoose';
import { MONGO_URI } from './env.js';

export async function connectDB(uri = MONGO_URI) {
  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  mongoose.set('strictQuery', false);
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5000
  });

  console.log('MongoDB connected');
}
