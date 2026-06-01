import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

export async function parseAndGenerate(pastedText) {
    const resumePath = path.resolve(process.cwd(), "AbdulHadi_Yaseen.pdf");
    const contents = [];

    // Check if the resume PDF exists in the root folder to supply candidate context
    if (fs.existsSync(resumePath)) {
        try {
            const resumeBuffer = fs.readFileSync(resumePath);
            contents.push({
                inlineData: {
                    data: resumeBuffer.toString("base64"),
                    mimeType: "application/pdf",
                },
            });
            console.log("Loaded AbdulHadi_Yaseen.pdf context for LinkedIn extraction.");
        } catch (err) {
            console.error("Error reading AbdulHadi_Yaseen.pdf resume:", err);
        }
    } else {
        console.warn("AbdulHadi_Yaseen.pdf not found in root. Proceeding without PDF resume context.");
    }

    const prompt = `
You are an advanced career intelligence assistant.
Your task is to analyze the pasted job description/listing text below (which the user copied directly from a LinkedIn post or other job site) and complete two operations:


1. INFORMATION EXTRACTION & SCREENING:
   - Identify and extract the "jobTitle" (the title of the role being hired).
   - Identify and extract the "companyName" (the name of the company hiring).
   - Extract the contact "recruiterEmail" address of the recruiter or hiring manager if mentioned anywhere in the pasted text. Look for standard email patterns or introductory phrases. If NO email is present in the text, return an empty string "".
   - Determine if the post actually asks candidates to apply by sending an email. Set "shouldApplyViaEmail" to true ONLY if the post contains an email and explicitly invites candidates to apply by emailing. If it directs the candidate to apply through an external website portal, Google Form link, or if no email is found, set "shouldApplyViaEmail" to false.

2. COLD OUTREACH COMPOSITION (CRITICAL FORMATTING INSTRUCTIONS):
   - Read the candidate's PDF resume (attached) to understand their background (Name: AbdulHadi Yaseen, skills: MEAN, MERN, Next.js, RAG, Agentic AI, VectorDB, etc.).
   - Write a highly professional, tailored, and concise application/outreach email (under 200 words) from AbdulHadi Yaseen applying to this job.
   - **MANDATORY OPENING CRITERIA**: The opening sentence/paragraph of the email MUST explicitly start by mentioning that you are a **Computer Science graduate from FAST-NUCES** (e.g. "As a Computer Science graduate from FAST-NUCES, I am writing to express my strong interest..." or "My name is AbdulHadi Yaseen, and I am a Computer Science graduate from FAST-NUCES..."). This is a strict requirement!
   - Highlight the candidate's most relevant skills/experiences matching the requirements of the job description.
   - Compose a compelling, customized email subject line.
   - **EMAIL SPACING & NEWLINES RULES (MANDATORY)**: You MUST format the email body with proper paragraph spacing and actual newline characters (\\n). Do NOT clump everything on a single line!
     Follow this exact template:
     
     Dear [Recruiter Name or Hiring Team],
     
     [Tailored Opening Paragraph explaining your interest in the role]
     
     [Core body paragraph highlighting 2-3 specific skills matching their post, referring to your attached resume]
     
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

The output MUST be a valid JSON object matching the requested schema.

Pasted Job/Listing Text:
${pastedText}
`;

    contents.push(prompt);

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    jobTitle: { type: "STRING", description: "Extracted title of the position." },
                    companyName: { type: "STRING", description: "Extracted hiring company name." },
                    recruiterEmail: { type: "STRING", description: "Extracted recruiter email, or empty string if not found." },
                    shouldApplyViaEmail: { type: "BOOLEAN", description: "Whether the post asks candidates to email their resume/application." },
                    subject: { type: "STRING", description: "Tailored email subject line." },
                    body: { type: "STRING", description: "Tailored concise email body cover letter, structured with double newlines (\\n\\n) for paragraphs and single newlines (\\n) for the contact details signature." },
                },
                required: ["jobTitle", "companyName", "recruiterEmail", "shouldApplyViaEmail", "subject", "body"],
            },
        },
    });

    try {
        const text = response.text;
        const result = JSON.parse(text.trim());
        return result;
    } catch (e) {
        console.error("Failed to parse Gemini JSON response. Response text:", response.text, e);
        // Clean fallback
        return {
            jobTitle: "Software Engineer",
            companyName: "Company",
            recruiterEmail: "",
            shouldApplyViaEmail: false,
            subject: "Application for Job Opportunity",
            body: response.text,
        };
    }
}