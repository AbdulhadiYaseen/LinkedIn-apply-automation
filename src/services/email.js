import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL,
        pass: process.env.APP_PASSWORD,
    },
});

export async function sendEmail(
    receiver,
    subject,
    content
) {
    const resumePath = path.resolve(process.cwd(), "AbdulHadi_Yaseen.pdf");

    await transporter.sendMail({
        from: process.env.EMAIL,
        to: receiver,
        subject,
        text: content,
        attachments: [
            {
                filename: "AbdulHadi_Yaseen.pdf",
                path: resumePath,
            },
        ],
    });
}