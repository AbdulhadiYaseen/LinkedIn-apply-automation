import mongoose from "mongoose";

const AppliedJobSchema = new mongoose.Schema(
    {
        jobId: {
            type: String,
            required: true,
            unique: true,
        },
        title: {
            type: String,
            required: true,
        },
        company: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        url: {
            type: String,
        },
        recruiterEmail: {
            type: String,
            required: true,
        },
        subject: {
            type: String,
            required: true,
        },
        body: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["sent", "failed", "draft"],
            default: "draft",
        },
        error: {
            type: String,
        },
        appliedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

export default mongoose.model("AppliedJob", AppliedJobSchema);
