// Helper function to extract email from job description text
export function extractEmail(htmlOrText) {
    if (!htmlOrText) return null;

    // Clean up HTML tags to make regex matching cleaner
    const cleanText = htmlOrText.replace(/<[^>]*>/g, " ");

    // Standard email regex pattern
    const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    const matches = cleanText.match(emailRegex);

    if (matches && matches.length > 0) {
        // Exclude system, job-board, or domain-restricted emails that aren't the recruiter
        const filtered = matches.filter((email) => {
            const lower = email.toLowerCase();
            return (
                !lower.includes("weworkremotely.com") &&
                !lower.includes("sentry.io") &&
                !lower.includes("example.com") &&
                !lower.includes("github.com") &&
                !lower.includes("bootstrap")
            );
        });
        if (filtered.length > 0) {
            return filtered[0];
        }
    }
    return null;
}
