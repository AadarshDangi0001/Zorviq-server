import userModel, { type UserDocument, type UserFields } from "../models/User.model.js";

type CreateUserInput = Omit<UserFields, "role"> & { verified?: boolean };

export const userRepository = {
  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await userModel.findOne({ email });
  },

  /**
   * Find user by email with password field selected
   */
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return await userModel.findOne({ email }).select("+password") as UserDocument | null;
  },

  /**
   * Find user by reset token
   */
  async findByResetToken(tokenHash: string): Promise<UserDocument | null> {
    return await userModel.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpire: { $gt: new Date() },
    });
  },

  /**
   * Create a new user
   */
  async create(userData: CreateUserInput): Promise<UserDocument> {
    return await userModel.create(userData);
  },

  /**
   * Update user and save
   */
  async saveUser(user: UserDocument): Promise<UserDocument> {
    return await user.save();
  },

};
