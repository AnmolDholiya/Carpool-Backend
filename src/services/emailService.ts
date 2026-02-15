import nodemailer from 'nodemailer';
import { getConfig } from '../config/config';

const { smtp } = getConfig();

const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.port === 465,
  auth: {
    user: smtp.user,
    pass: smtp.pass,
  },
});

export async function sendOtpEmail(to: string, otp: string) {
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: 'Your verification code',
    text: `Your verification code is ${otp}. It is valid for 10 minutes.`,
  };

  await transporter.sendMail(mailOptions);
}


