import OpenAI from "openai";
import { getResumeText } from "./resumeParser.js";

/**
 * Helper function to clean and parse JSON from the model's text response.
 * Handles cases where the model wraps JSON in markdown blocks (e.g. ```json ... ```).
 * 
 * @param {string} text The raw response text from the LLM.
 * @returns {object} The parsed JSON object.
 */
function parseJsonSafe(text) {
    const trimmed = text.trim();
    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (e) {
        // Try to match markdown JSON block
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const blockMatch = trimmed.match(jsonBlockRegex);
        if (blockMatch && blockMatch[1]) {
            try {
                parsed = JSON.parse(blockMatch[1].trim());
            } catch (innerErr) {
                // fall through
            }
        }

        if (!parsed) {
            // Try to match any curly brace structure
            const curlyBraceRegex = /({[\s\S]*})/;
            const curlyMatch = trimmed.match(curlyBraceRegex);
            if (curlyMatch && curlyMatch[1]) {
                try {
                    parsed = JSON.parse(curlyMatch[1].trim());
                } catch (innerErr) {
                    // fall through
                }
            }
        }
    }

    if (parsed) {
        if (typeof parsed.body === "string") {
            parsed.body = parsed.body.replaceAll("\\n", "\n");
        }
        return parsed;
    }

    throw new Error(`Failed to extract valid JSON from response. Raw output:\n${text}`);
}

/**
 * Primary generator that queries the OpenRouter API.
 * 
 * @param {string} pastedText The pasted job listing description.
 * @returns {Promise<object>} The parsed screening & email draft response.
 */
export async function parseAndGenerate(pastedText) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not defined in the environment variables. Please check your .env file.");
    }

    const modelName = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
    console.log(`🤖 Initializing OpenRouter connection for model: "${modelName}"`);

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: "https://openrouter.ai/api/v1",
    });

    // Retrieve resume text (either from TXT or parsed from PDF)
    const resumeText = await getResumeText();

    const prompt = `
You are an advanced career intelligence assistant.
Your task is to analyze the pasted job description/listing text below and complete two operations:

Candidate Resume Context:
${resumeText || "[No resume file context found. Assuming Name: AbdulHadi Yaseen, Fast-NUCES CS Graduate]"}

1. INFORMATION EXTRACTION & SCREENING:
   - Identify and extract the "jobTitle" (the title of the role being hired).
   - Identify and extract the "companyName" (the name of the company hiring).
   - Extract the contact "recruiterEmail" address of the recruiter or hiring manager if mentioned anywhere in the pasted text. Look for standard email patterns or introductory phrases. If NO email is present in the text, return an empty string "".
   - Determine if the post actually asks candidates to apply by sending an email. Set "shouldApplyViaEmail" to true ONLY if the post contains an email and explicitly invites candidates to apply by emailing. If it directs the candidate to apply through an external website portal, Google Form link, or if no email is found, set "shouldApplyViaEmail" to false.

2. COLD OUTREACH COMPOSITION (CRITICAL FORMATTING INSTRUCTIONS):
   - Read the candidate's resume/details to understand their background (Name: AbdulHadi Yaseen, skills: MEAN, MERN, Next.js, RAG, Agentic AI, VectorDB, etc.).
   - Write a highly professional, tailored, and concise application/outreach email (under 200 words) from AbdulHadi Yaseen applying to this job.
   - **MANDATORY OPENING CRITERIA**: The opening sentence/paragraph of the email MUST explicitly start by mentioning that you are a **Computer Science graduate from FAST-NUCES** (e.g. "As a Computer Science graduate from FAST-NUCES, I am writing to express my strong interest..." or "My name is AbdulHadi Yaseen, and I am a Computer Science graduate from FAST-NUCES..."). This is a strict requirement!
   - Highlight the candidate's most relevant skills/experiences matching the requirements of the job description.
   - Compose a compelling, customized email subject line.
   - **EMAIL SPACING & NEWLINES RULES (MANDATORY)**: You MUST format the email body with proper paragraph spacing and actual newline characters (\\n). Do NOT clump everything on a single line!
     Follow this exact template:
     
     Dear [Recruiter Name or Hiring Team],
     
     [Tailored Opening Paragraph explaining your interest in the role]
     
     [Core body paragraph highlighting 2-3 specific skills matching their post, referring to your resume]
     
     [Tailored closing paragraph with call-to-action]
     
     Sincerely,
     AbdulHadi Yaseen
     
     📧 abdulhadiyaseen2004@gmail.com
     📞 +92 326 0345093
     🔗 https://www.linkedin.com/in/abdulhadi-yaseen
     💻 https://github.com/AbdulhadiYaseen
     🌐 http://abdulhadiyaseen.vercel.app

   - Close the signature block exactly like the format above, with each link/detail on a **separate new line** (using actual \\n characters).
   - Do NOT use generic placeholders in the final output. Close the email professionally.

--------------------------------------------------
OUTPUT FORMAT:
You MUST respond with a single valid JSON object. Do not include any other markdown text, formatting, or wrapping outside the JSON object.
The JSON object must have exactly the following structure:
{
    "jobTitle": "Extracted title of the position",
    "companyName": "Extracted hiring company name",
    "recruiterEmail": "Extracted recruiter email, or empty string if not found",
    "shouldApplyViaEmail": true/false,
    "subject": "Tailored email subject line",
    "body": "Tailored concise email body cover letter, structured with double newlines (\\n\\n) for paragraphs and single newlines (\\n) for the contact details signature."
}

Pasted Job/Listing Text:
${pastedText}
`;

    const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        extraHeaders: {
            "HTTP-Referer": "https://github.com/AbdulhadiYaseen/LinkedIn-apply-automation",
            "X-Title": "LinkedIn Apply Automation",
        },
    });

    const outputText = response.choices[0]?.message?.content;
    if (!outputText) {
        throw new Error("Received empty response from OpenRouter API.");
    }

    return parseJsonSafe(outputText);
}

// Export alias for compatibility with other entry points (e.g. cron.js)
export const generateEmail = parseAndGenerate;
