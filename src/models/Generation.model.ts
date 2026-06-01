
import mongoose, { Document, Schema, Model, Types } from "mongoose";


export type GenerationStatus = "queued" | "streaming" | "done" | "failed";

export interface IGeneration extends Document {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  prompt: string;               // original user prompt (shown in history)
  augmentedPrompt: string;      // prompt + RAG context (sent to Claude)
  output: string | null;        // final generated HTML
  status: GenerationStatus;
  isSectionEdit: boolean;
  sectionId: string | null;     // data-section-id of targeted section
  sectionHtml: string | null;   // original HTML of targeted section
  ragChunksUsed: number;        // how many RAG components were injected
  tokenCount: number | null;    // Claude output tokens (for cost tracking)
  durationMs: number | null;    // total generation time in ms
  errorMessage: string | null;  // human-readable error if status=failed
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGenerationModel extends Model<IGeneration> {
  findRecentByProject(
    projectId: string,
    limit?: number
  ): Promise<IGeneration[]>;
}


const generationSchema = new Schema<IGeneration>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, "Prompt must not exceed 2000 characters"],
    },
    augmentedPrompt: {
      type: String,
      required: true,
      // Not trimmed — RAG context may have intentional whitespace
    },
    output: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["queued", "streaming", "done", "failed"],
      default: "queued",
      index: true,
    },
    isSectionEdit: {
      type: Boolean,
      default: false,
    },
    sectionId: {
      type: String,
      default: null,
      trim: true,
    },
    sectionHtml: {
      type: String,
      default: null,
    },
    ragChunksUsed: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    tokenCount: {
      type: Number,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    archived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    // Optimize reads: don't return augmentedPrompt by default (can be large)
    toJSON: {
      transform: (_doc, ret) => {
        const result = ret as Record<string, unknown>;
        delete result.augmentedPrompt;
        delete result.sectionHtml;
        delete result.__v;
        return ret;
      },
    },
  }
);



// Primary query: "get recent generations for this project"
generationSchema.index({ projectId: 1, createdAt: -1 });

// Partial index: only index non-terminal jobs (used by queue health checks)
generationSchema.index(
  { status: 1, createdAt: 1 },
  { partialFilterExpression: { status: { $in: ["queued", "streaming"] } } }
);

// Archival job: find old completed generations
generationSchema.index(
  { archived: 1, createdAt: 1 },
  { partialFilterExpression: { archived: false } }
);


generationSchema.statics.findRecentByProject = function (
  projectId: string,
  limit = 10
): Promise<IGeneration[]> {
  return this.find({ projectId, archived: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-augmentedPrompt -sectionHtml")
    .lean()
    .exec();
};


export const Generation = (mongoose.models.Generation ||
  mongoose.model<IGeneration, IGenerationModel>(
    "Generation",
    generationSchema
  )) as IGenerationModel;
