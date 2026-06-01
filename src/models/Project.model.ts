import mongoose, { type HydratedDocument, type Model, type Types } from "mongoose";

export type ProjectFields = {
    userId: Types.ObjectId;
    name: string;
    currentCode: string;
    isDeleted: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type ProjectDocument = HydratedDocument<ProjectFields>;
type ProjectModel = Model<ProjectFields>;

const projectSchema = new mongoose.Schema<ProjectFields, ProjectModel>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
            default: "Untitled Project",
        },
        currentCode: {
            type: String,
            default: "",
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

projectSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
projectSchema.index({ _id: 1, userId: 1, isDeleted: 1 });
projectSchema.index(
    { userId: 1, name: 1 },
    {
        unique: true,
        partialFilterExpression: { isDeleted: false },
        collation: { locale: "en", strength: 2 },
    }
);

const Project =
    (mongoose.models.Project as ProjectModel | undefined) ??
    mongoose.model<ProjectFields, ProjectModel>("Project", projectSchema);

export default Project;
