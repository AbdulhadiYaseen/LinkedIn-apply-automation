import fs from "fs";
import path from "path";
import pdf from "pdf-parse";

let cachedResumeText = null;

/**
 * Retrieves the candidate resume text.
 * Checks for AbdulHadi_Yaseen.txt first (for maximum text format control).
 * If not found, falls back to parsing AbdulHadi_Yaseen.pdf dynamically.
 * Caches the result in memory for consecutive runs.
 * 
 * @returns {Promise<string>} The extracted resume text.
 */
export async function getResumeText() {
    if (cachedResumeText !== null) {
        return cachedResumeText;
    }

    const txtPath = path.resolve(process.cwd(), "AbdulHadi_Yaseen.txt");
    if (fs.existsSync(txtPath)) {
        try {
            console.log("📄 Loading resume context from AbdulHadi_Yaseen.txt...");
            cachedResumeText = fs.readFileSync(txtPath, "utf8");
            return cachedResumeText;
        } catch (err) {
            console.error("❌ Error reading AbdulHadi_Yaseen.txt:", err);
        }
    }

    const pdfPath = path.resolve(process.cwd(), "AbdulHadi_Yaseen.pdf");
    if (fs.existsSync(pdfPath)) {
        try {
            console.log("📄 Extracting resume text from AbdulHadi_Yaseen.pdf...");
            const dataBuffer = fs.readFileSync(pdfPath);
            const parsedData = await pdf(dataBuffer);
            cachedResumeText = parsedData.text || "";
            return cachedResumeText;
        } catch (err) {
            console.error("❌ Error parsing AbdulHadi_Yaseen.pdf:", err);
        }
    }

    console.warn("⚠️ No resume context found (neither AbdulHadi_Yaseen.txt nor AbdulHadi_Yaseen.pdf exists).");
    cachedResumeText = "";
    return cachedResumeText;
}
