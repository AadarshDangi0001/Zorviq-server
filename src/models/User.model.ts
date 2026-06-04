import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';

type UserRole = 'user' | 'admin';

export type UserFields = {
  email: string;
  contact?: string;
  password?: string;
  fullname: string;
  role: UserRole;
  googleId?: string;
  githubConnected?: boolean;
  githubUsername?: string;
  githubAvatar?: string;
  githubAccessToken?: string;
  verified: boolean;
  verificationToken?: string;
  verificationTokenExpire?: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
};

type UserMethods = {
  comparePassword(password: string): Promise<boolean>;
};

export type UserDocument = HydratedDocument<UserFields, UserMethods>;
type UserModel = Model<UserFields, object, UserMethods>;

const removePrivateFields = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret.password;
  delete ret.githubAccessToken;
  delete ret.verificationToken;
  delete ret.verificationTokenExpire;
  delete ret.resetPasswordToken;
  delete ret.resetPasswordExpire;
  delete ret.__v;

  return ret;
};

const userSchema = new mongoose.Schema<UserFields, UserModel, UserMethods>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    contact: { type: String, required: false },
    password: {
      type: String,
      select: false,
      required: function (this: UserFields): boolean {
        return !this.googleId;
      },
    },
    fullname: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    googleId: {
      type: String,
    },
    githubConnected: {
      type: Boolean,
      default: false,
    },
    githubUsername: {
      type: String,
    },
    githubAvatar: {
      type: String,
    },
    githubAccessToken: {
      type: String,
      select: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
    toJSON: { transform: removePrivateFields },
    toObject: { transform: removePrivateFields },
  }
);

userSchema.pre('save', async function (this: UserDocument) {
  if (!this.isModified('password') || !this.password) return;

  const hash = await bcrypt.hash(this.password, 10);
  this.password = hash;
});

userSchema.methods.comparePassword = async function (this: UserDocument, password: string) {
  if (!this.password) return false;

  return await bcrypt.compare(password, this.password);
};
const userModel =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<UserFields, UserModel>('User', userSchema);

export default userModel;
