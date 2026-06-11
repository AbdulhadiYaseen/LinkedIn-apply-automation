import puppeteer from "puppeteer";
import readline from "readline";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import crypto from "crypto";
import "dotenv/config";
import AppliedJob from "../models/AppliedJob.js";
import { parseAndGenerate } from "./openRouter.js";
import { sendEmail } from "./email.js";

// MONGODB CONNECTION CHECK
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/job-automation";

// Console readline prompt setup
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// SELECTOR CONFIGURATION
const SELECTORS = {
    // 1. Target ID search selector specified by the user
    searchInput: '[data-testid="typeahead-input"]',

    // 2. Target elements for LinkedIn feed posts / search results containing job descriptions
    postCard: '[data-testid="expandable-text-box"], .feed-shared-update-v2, [data-urn], div.search-results__list-item',
    
    // 3. User-identified DevTools "... more" selector to expand descriptions
    moreButton: "[data-testid='expandable-text-more-button'], .feed-shared-inline-show-more-text__button, span[data-testid='expandable-text-more-button']",
    
    // 4. Expanded text container matching user's exact HTML classes
    postText: "[data-testid='expandable-text-box'], ._5c57f7cc._72b1cfcb, .feed-shared-inline-show-more-text, .feed-shared-update-v2__description"
};

async function askQuestion(query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

export async function runLinkedInAutomation() {
    console.log("==================================================");
    console.log("🦁 Welcome to the AutoJob LinkedIn Automation Scanner");
    console.log("==================================================");

    // Prompt for filters
    const filter = await askQuestion("👉 Enter your LinkedIn job search filters (e.g. 'MERN Developer remote Karachi'): ");
    if (!filter || filter.trim() === "") {
        console.log("❌ Search filter cannot be empty. Exiting.");
        rl.close();
        return;
    }

    console.log(`\n🚀 Initializing browser automation for filter: "${filter}"...`);

    // MongoDB connection validation
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");
    }

    const sessionPath = path.resolve(process.cwd(), "linkedin-session");

    // Launch chrome in visual mode so they can stay logged in
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        userDataDir: sessionPath,
        args: [
            "--start-maximized",
            "--disable-blink-features=AutomationControlled"
        ]
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    try {
        // Step 1: Navigate to Feed
        const feedUrl = "https://www.linkedin.com/feed/";
        console.log(`🔗 Navigating to LinkedIn Feed: ${feedUrl}`);
        await page.goto(feedUrl, { waitUntil: "load", timeout: 60000 });

        console.log("\n==================================================");
        console.log("🔑 LOGIN / SESSION CHECK:");
        console.log("Waiting for feed and search bar to load... If you need to log in, please sign in in the browser window now.");
        
        // Wait up to 45 seconds for search bar (gives ample time for manual sign-in on first run if needed)
        await page.waitForSelector(SELECTORS.searchInput, { timeout: 45000 });
        console.log("✅ Search bar detected! Proceeding automatically...");

        console.log(`\n🔍 Searching for your filter: "${filter}"...`);
        await page.click(SELECTORS.searchInput);
        
        // Type the keyword query
        await page.type(SELECTORS.searchInput, filter);
        
        // Press Enter to submit search
        await page.keyboard.press("Enter");
        console.log("Submitted search query! Waiting for page to load...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 3: Automatically click "Posts" Filter Tab to filter results
        console.log("\n⚡ Automatically clicking 'Posts' filter tab...");
        const clickedPosts = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('label, button, a, span'));
            const postsLabel = elements.find(el => el.textContent.trim() === 'Posts');
            if (postsLabel) {
                postsLabel.click();
                return true;
            }
            return false;
        });

        if (clickedPosts) {
            console.log("✅ Successfully clicked 'Posts' filter tab! Loading posts feed...");
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for feed to update
        } else {
            console.warn("⚠️ Could not click 'Posts' tab automatically. Please make sure you click it manually in the browser window.");
        }

        console.log("\n⏳ Beginning automation crawler...");

        // Scroll the list down slowly to lazy load cards
        await page.evaluate(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
        await new Promise(resolve => setTimeout(resolve, 3000));

        let processedCount = 0;
        let appliedCount = 0;
        let skippedCount = 0;
        let consecutiveAlreadyApplied = 0;
        
        // Track unique description hashes processed during this single execution
        const processedHashesInRun = new Set();

        console.log("Entering dynamic infinite scroll crawler loop...");

        // Infinite loop: continues scrolling and loading until it runs out of new posts
        while (processedCount < 100) { 
            // 1. Query all job/post cards currently loaded on the screen
            const cards = await page.$$(SELECTORS.postCard);
            console.log(`\n[Crawler] Found ${cards.length} posts loaded in view. Processing new ones...`);
            
            let processedNewThisBatch = 0;

            for (let i = 0; i < cards.length; i++) {
                const card = cards[i];

                try {
                    // Extract description text first without scrolling or clicking to check duplicates instantly!
                    const rawDescription = await page.evaluate((el, textSel) => {
                        if (el.matches && el.matches(textSel)) {
                            return el.innerText.trim();
                        }
                        const descEl = el.querySelector(textSel);
                        return descEl ? descEl.innerText.trim() : el.innerText.trim();
                    }, card, SELECTORS.postText);

                    if (!rawDescription || rawDescription.trim().length < 10) {
                        continue;
                    }

                    const cleanDesc = rawDescription.replace(/\s+/g, " ");
                    const descHash = crypto.createHash("md5").update(cleanDesc).digest("hex");

                    // Skip immediately if processed in this runtime batch
                    if (processedHashesInRun.has(descHash)) {
                        continue;
                    }

                    // Query MongoDB: Prevent duplicate applications!
                    const alreadyApplied = await AppliedJob.findOne({ 
                        $or: [{ jobId: descHash }, { description: cleanDesc }] 
                    });

                    if (alreadyApplied) {
                        processedHashesInRun.add(descHash); // Mark as checked locally
                        continue; 
                    }

                    // If it is a completely new post, process it!
                    processedNewThisBatch++;
                    processedHashesInRun.add(descHash);

                    console.log(`\n--------------------------------------------------`);
                    console.log(`Processing card ${processedCount + 1} (Found new post!)...`);

                    // Scroll the listing card into view smoothly
                    await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), card);
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Click the "... more" button to expand description
                    const moreBtn = await card.$(SELECTORS.moreButton);
                    if (moreBtn) {
                        console.log("Found '... more' button. Clicking to expand full description...");
                        await page.evaluate((btn) => btn.click(), moreBtn);
                        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for text expansion
                    }

                    // Extract the expanded description text safely
                    const expandedDescription = await page.evaluate((el, textSel) => {
                        if (el.matches && el.matches(textSel)) {
                            return el.innerText.trim();
                        }
                        const descEl = el.querySelector(textSel);
                        return descEl ? descEl.innerText.trim() : el.innerText.trim();
                    }, card, SELECTORS.postText);

                    const cleanExpandedDesc = expandedDescription.replace(/\s+/g, " ");
                    const expandedHash = crypto.createHash("md5").update(cleanExpandedDesc).digest("hex");

                    // Save expanded hash to locals
                    processedHashesInRun.add(expandedHash);

                    // Extract title / company name from post elements or set generic
                    const extractedName = await page.evaluate((el) => {
                        const actorTitle = el.querySelector(".update-components-actor__title, .feed-shared-actor__title");
                        return actorTitle ? actorTitle.innerText.trim().split("\n")[0] : "LinkedIn Recruiter";
                    }, card);

                    console.log(`📝 Crawled Post Description (Length: ${cleanExpandedDesc.length} chars)`);

                    // Call OpenRouter to parse, verify rules, and draft outreach
                    console.log("🤖 Running OpenRouter analysis...");
                    const draft = await parseAndGenerate(cleanExpandedDesc);

                    console.log(`   - Extracted Recruiter Email: ${draft.recruiterEmail || "NONE"}`);
                    console.log(`   - Is Email Application Invited?: ${draft.shouldApplyViaEmail}`);

                    // Verify email application criteria
                    if (draft.shouldApplyViaEmail && draft.recruiterEmail && draft.recruiterEmail.includes("@")) {
                        console.log(`🚀 Email application requested! Sending email to ${draft.recruiterEmail}...`);
                        
                        // Dispatch via Nodemailer
                        await sendEmail(draft.recruiterEmail, draft.subject, draft.body);
                        
                        // Log in MongoDB as sent
                        await AppliedJob.create({
                            jobId: expandedHash,
                            title: draft.jobTitle || "Software Engineer",
                            company: draft.companyName || extractedName,
                            description: cleanExpandedDesc,
                            url: page.url(),
                            recruiterEmail: draft.recruiterEmail,
                            subject: draft.subject,
                            body: draft.body,
                            status: "sent"
                        });

                        console.log("✅ Application successfully sent and saved in MongoDB history!");
                        appliedCount++;
                    } else {
                        console.log("⏭️ Skipped: Post does not instruct applying through direct email (requires form or no email listed).");
                        
                        // Save as draft in DB with a warning so we mark it as processed (blocking future duplicate runs)
                        await AppliedJob.create({
                            jobId: expandedHash,
                            title: draft.jobTitle || "Software Engineer",
                            company: draft.companyName || extractedName,
                            description: cleanExpandedDesc,
                            url: page.url(),
                            recruiterEmail: draft.recruiterEmail || "skipped@external-portal.com",
                            subject: draft.subject || "Requires External Portal",
                            body: draft.body || "This post redirects candidates to apply via a website form or portal link instead of direct email.",
                            status: "draft"
                        });
                        
                        skippedCount++;
                    }

                    processedCount++;

                } catch (cardErr) {
                    console.error("❌ Error processing individual card item:", cardErr.message);
                }

                // Small delay between applications to be safe
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Scroll down to trigger infinite scroll load of new posts
            console.log("\n⏳ Scrolling down to trigger dynamic loading of new posts...");
            await page.evaluate(() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            });
            console.log("Waiting for new posts to lazy-load...");
            await new Promise(resolve => setTimeout(resolve, 6000)); // Ample wait time for new elements to load!

            // End run if we spent a whole scroll batch and found zero new listings
            if (processedNewThisBatch === 0) {
                console.log("No new unprocessed posts loaded after scrolling. Finishing run.");
                break;
            }
        }

        console.log("\n==================================================");
        console.log("📊 RUN COMPLETE:");
        console.log(`   - Total Cards Analyzed & Saved: ${processedCount}`);
        console.log(`   - Applications Sent: ${appliedCount}`);
        console.log(`   - Skipped (External links or no emails): ${skippedCount}`);
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Critical exception during crawler operation:", err.message);
    } finally {
        console.log("\nClosing browser sessions...");
        await browser.close();
        rl.close();
        process.exit(0);
    }
}

// Check if launched directly from node command line
const isDirectRun = process.argv[1] && (
    process.argv[1].endsWith("linkedin.js") ||
    process.argv[1].includes("linkedin")
);

if (isDirectRun) {
    runLinkedInAutomation();
}
