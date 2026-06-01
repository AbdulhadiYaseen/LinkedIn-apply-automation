import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import AppliedJob from "./models/AppliedJob.js";
import { parseAndGenerate } from "./services/gemini.js";
import { sendEmail } from "./services/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static frontend dashboard from 'public' directory
app.use(express.static(path.join(__dirname, "../public")));

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/job-automation";
console.log("Connecting to MongoDB at:", MONGO_URI);

mongoose
    .connect(MONGO_URI)
    .then(() => console.log("Successfully connected to MongoDB."))
    .catch((err) => {
        console.error("MongoDB connection error:", err.message);
        console.warn("Continuing server launch, but database functionality will fail until connected.");
    });

// API Routes

// 1. Magic Parse & Draft Cover Letter from Pasted Text (LinkedIn)
app.post("/api/jobs/parse-paste", async (req, res) => {
    const { pastedText } = req.body;
    if (!pastedText) {
        return res.status(400).json({ success: false, error: "Pasted text content is required." });
    }

    try {
        console.log("Processing pasted LinkedIn/Job text with Gemini...");
        const result = await parseAndGenerate(pastedText);
        res.json({ success: true, analysis: result });
    } catch (error) {
        console.error("Error in /api/jobs/parse-paste:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Dispatch application email and store log in MongoDB
app.post("/api/jobs/apply", async (req, res) => {
    const {
        title,
        company,
        description,
        url,
        recruiterEmail,
        subject,
        body,
    } = req.body;

    if (!title || !company || !recruiterEmail || !subject || !body) {
        return res.status(400).json({
            success: false,
            error: "title, company, recruiterEmail, subject, and body are required fields.",
        });
    }

    // Generate a unique jobId by hashing company + title to prevent duplicate outreach
    const uniqueString = `${company.trim().toLowerCase()}_${title.trim().toLowerCase()}`;
    const jobId = crypto.createHash("md5").update(uniqueString).digest("hex");

    console.log(`Processing application for "${title}" at "${company}" (ID: ${jobId})...`);

    try {
        // Double-check if we already successfully applied to this company & role
        const existing = await AppliedJob.findOne({ jobId, status: "sent" });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: `Duplicate Application Blocked: You have already successfully sent an application for "${title}" at "${company}".`,
            });
        }

        // Send email via Nodemailer
        console.log(`Sending application email to ${recruiterEmail}...`);
        await sendEmail(recruiterEmail, subject, body);
        console.log(`Email successfully sent!`);

        // Save or update in MongoDB as 'sent'
        const updatedJob = await AppliedJob.findOneAndUpdate(
            { jobId },
            {
                title,
                company,
                description: description || "Manually pasted LinkedIn job description.",
                url: url || "",
                recruiterEmail,
                subject,
                body,
                status: "sent",
                error: null,
            },
            { upsert: true, new: true }
        );

        res.json({ success: true, message: "Application sent and saved successfully!", data: updatedJob });
    } catch (error) {
        console.error("Application/Email delivery failed:", error);

        // Store failed application in MongoDB to allow retry/review
        try {
            const failedJob = await AppliedJob.findOneAndUpdate(
                { jobId },
                {
                    title,
                    company,
                    description: description || "Manually pasted LinkedIn job description.",
                    url: url || "",
                    recruiterEmail,
                    subject,
                    body,
                    status: "failed",
                    error: error.message,
                },
                { upsert: true, new: true }
            );
            res.status(500).json({
                success: false,
                error: `Email delivery failed: ${error.message}. Saved as failed in history.`,
                data: failedJob,
            });
        } catch (dbErr) {
            res.status(500).json({
                success: false,
                error: `Email failed: ${error.message}. DB Save failed: ${dbErr.message}`,
            });
        }
    }
});

// 3. Get applied history
app.get("/api/applications", async (req, res) => {
    try {
        const history = await AppliedJob.find().sort({ appliedAt: -1 });
        res.json({ success: true, count: history.length, applications: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 4. Delete an application record
app.delete("/api/applications/:id", async (req, res) => {
    try {
        await AppliedJob.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Application history record deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 5. Get stats summary
app.get("/api/stats", async (req, res) => {
    try {
        const total = await AppliedJob.countDocuments();
        const sent = await AppliedJob.countDocuments({ status: "sent" });
        const failed = await AppliedJob.countDocuments({ status: "failed" });
        const draft = await AppliedJob.countDocuments({ status: "draft" });

        res.json({
            success: true,
            stats: { total, sent, failed, draft },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Automated Job Application Server listening on port ${PORT}`);
    console.log(`🌐 Control Panel Dashboard: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
