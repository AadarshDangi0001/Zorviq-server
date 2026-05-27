import userModel, { type UserDocument, type UserFields } from "../models/User.model.js";

type CreateUserInput = Omit<UserFields, "role"> & { verified?: boolean };
type UpdateUserInput = Partial<UserFields>;

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
   * Find user by ID
   */
  async findById(id: string): Promise<UserDocument | null> {
    return await userModel.findById(id);
  },

  /**
   * Find user by reset token
   */
  async findByResetToken(id: string, token: string): Promise<UserDocument | null> {
    return await userModel.findOne({
      _id: id,
      resetPasswordToken: token,
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
   * Update user by ID
   */
  async updateById(id: string, updateData: UpdateUserInput): Promise<UserDocument | null> {
    return await userModel.findByIdAndUpdate(id, updateData, { new: true });
  },

  /**
   * Update user and save
   */
  async saveUser(user: UserDocument): Promise<UserDocument> {
    return await user.save();
  },

  /**
   * Delete user by ID
   */
  async deleteById(id: string): Promise<UserDocument | null> {
    return await userModel.findByIdAndDelete(id);
  },

  /**
   * Check if user exists by email
   */
  async existsByEmail(email: string): Promise<boolean> {
    const user = await userModel.findOne({ email });
    return !!user;
  },
};
