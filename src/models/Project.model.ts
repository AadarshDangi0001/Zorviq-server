import mongoose, { type Document, type Model, type Types, Schema } from 'mongoose';

export interface IProject extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  currentCode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    currentCode: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const result = ret as Record<string, unknown>;
        delete result.__v;
        return ret;
      },
    },
  }
);

export const Project =
  (mongoose.models.Project as Model<IProject> | undefined) ??
  mongoose.model<IProject>('Project', projectSchema);
