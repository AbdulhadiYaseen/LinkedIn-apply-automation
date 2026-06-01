import "dotenv/config";
import mongoose from "mongoose";
import cron from "node-cron";
import AppliedJob from "./src/models/AppliedJob.js";
import { fetchJobs } from "./src/services/jobs.js";
import { generateEmail } from "./src/services/gemini.js";
import { sendEmail } from "./src/services/email.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/job-automation";

async function runAutomation() {
    console.log("==================================================");
    console.log("🤖 Starting Background Job Application Scan...");
    console.log("==================================================");

    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(MONGO_URI);
            console.log("Connected to MongoDB for background process.");
        }

        // Fetch developer/tech jobs matching default keywords
        const jobs = await fetchJobs();
        console.log(`Processing ${jobs.length} filtered candidate jobs...`);

        let sentCount = 0;
        let draftCount = 0;
        let skipCount = 0;
        let failCount = 0;

        for (const job of jobs) {
            // Check if already processed (sent, failed, or drafted)
            const existing = await AppliedJob.findOne({ jobId: job.jobId });
            if (existing) {
                skipCount++;
                continue;
            }

            console.log(`\nNew Job: "${job.title}" at ${job.company}`);

            try {
                // Generate customized subject and email body with Gemini
                console.log(`Drafting application email with Gemini...`);
                const draft = await generateEmail(job.description);

                if (job.recruiterEmail) {
                    console.log(`Found recruiter email: ${job.recruiterEmail}. Sending...`);
                    await sendEmail(job.recruiterEmail, draft.subject, draft.body);

                    // Save to MongoDB as sent
                    await AppliedJob.create({
                        jobId: job.jobId,
                        title: job.title,
                        company: job.company,
                        description: job.description,
                        url: job.url,
                        recruiterEmail: job.recruiterEmail,
                        subject: draft.subject,
                        body: draft.body,
                        status: "sent",
                    });
                    console.log(`✅ Successfully sent application to ${job.company}!`);
                    sentCount++;
                } else {
                    console.log(`⚠️ No recruiter email found. Saving as 'draft' for dashboard review.`);
                    // Save to MongoDB as draft/pending
                    await AppliedJob.create({
                        jobId: job.jobId,
                        title: job.title,
                        company: job.company,
                        description: job.description,
                        url: job.url,
                        recruiterEmail: "", // Leave blank to be filled by user in dashboard
                        subject: draft.subject,
                        body: draft.body,
                        status: "draft",
                    });
                    draftCount++;
                }
            } catch (jobErr) {
                console.error(`❌ Failed to process ${job.title} at ${job.company}:`, jobErr.message);
                failCount++;
                
                // Save failed attempt to MongoDB so we don't spam attempts on the same job
                try {
                    await AppliedJob.create({
                        jobId: job.jobId,
                        title: job.title,
                        company: job.company,
                        description: job.description,
                        url: job.url,
                        recruiterEmail: job.recruiterEmail || "",
                        subject: "Draft Generation Error",
                        body: `Failure: ${jobErr.message}`,
                        status: "failed",
                        error: jobErr.message,
                    });
                } catch (dbErr) {
                    console.error("Database save failed for error log:", dbErr.message);
                }
            }

            // Small delay to prevent API/Email rate limits
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        console.log("\n==================================================");
        console.log("📊 Background Automation Summary:");
        console.log(`   - Total Matching Jobs: ${jobs.length}`);
        console.log(`   - Already Processed (Skipped): ${skipCount}`);
        console.log(`   - Applications Sent: ${sentCount}`);
        console.log(`   - Saved as Drafts (Needs Email Review): ${draftCount}`);
        console.log(`   - Failed Processes: ${failCount}`);
        console.log("==================================================");
    } catch (err) {
        console.error("Critical error in automation runner:", err);
    }
}

// If executed directly from shell, run immediately
const isDirectRun = process.argv[1] && (
    process.argv[1].endsWith("cron.js") || 
    process.argv[1].includes("cron")
);

if (isDirectRun) {
    console.log("Running standalone automation scan immediately...");
    runAutomation().then(() => {
        console.log("Standalone background scan completed. Exiting...");
        process.exit(0);
    });
}

// Schedule cron to run daily at 9:00 AM
cron.schedule("0 9 * * *", () => {
    console.log("Scheduled cron triggering at 09:00 AM...");
    runAutomation();
});

export { runAutomation };
