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

export async function sendBookingNotification(to: string, data: {
  riderName: string,
  riderPhone: string,
  seats: number,
  source: string,
  destination: string,
  rideDate: string
}) {
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: 'New Booking for your Ride! 🚗',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #000;">Great news! Someone just joined your ride.</h2>
        <p><strong>${data.riderName}</strong> has booked <strong>${data.seats} seat(s)</strong> for your trip from <strong>${data.source}</strong> to <strong>${data.destination}</strong>.</p>
        <p><strong>Date:</strong> ${new Date(data.rideDate).toLocaleDateString()}</p>
        <p><strong>Rider Contact:</strong> ${data.riderPhone}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Manage your rides in your dashboard.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendBookingStatusEmail(to: string, data: {
  riderName: string,
  rideDetails: string,
  status: 'CONFIRMED' | 'REJECTED',
  rideDate: string
}) {
  const isApproved = data.status === 'CONFIRMED';
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: isApproved ? 'Booking Confirmed! 🎉' : 'Booking Update',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: ${isApproved ? '#22c55e' : '#ef4444'};">
          ${isApproved ? 'Your ride is confirmed!' : 'Update on your ride request'}
        </h2>
        <p>Hi ${data.riderName},</p>
        <p>The publisher has <strong>${isApproved ? 'approved' : 'rejected'}</strong> your booking request for the ride <strong>${data.rideDetails}</strong> on <strong>${new Date(data.rideDate).toLocaleDateString()}</strong>.</p>
        ${isApproved ? '<p>You can now see the driver contact details in your dashboard.</p>' : '<p>We are sorry, but you can search for other available rides on our platform.</p>'}
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Check your dashboard for more details.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendCancellationEmail(to: string, data: {
  name: string,
  type: 'RIDE' | 'BOOKING',
  details: string,
  date: string,
  reason?: string
}) {
  const isRide = data.type === 'RIDE';
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: isRide ? 'Ride Cancelled ❌' : 'Booking Cancelled ❌',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #ef4444;">
          ${isRide ? 'Important: A ride you joined has been cancelled' : 'Important: A booking for your ride has been cancelled'}
        </h2>
        <p>Hi ${data.name},</p>
        <p>We are writing to inform you that the ${isRide ? 'ride' : 'booking'} <strong>${data.details}</strong> scheduled for <strong>${new Date(data.date).toLocaleDateString()}</strong> has been cancelled.</p>
        ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
        <p>We apologize for the inconvenience. ${isRide ? 'You can search for other available rides on our platform.' : 'Your seats have been reverted and are now available for other passengers.'}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Manage your activity in your dashboard.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
} export async function sendRideCompletionEmail(to: string, data: {
  name: string,
  source: string,
  destination: string,
  date: string,
  driverName: string,
}) {
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: 'Your ride is complete! 🎉',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #22c55e;">You've reached your destination!</h2>
        <p>Hi ${data.name},</p>
        <p>Your ride with <strong>${data.driverName}</strong> from <strong>${data.source}</strong> to <strong>${data.destination}</strong> on <strong>${new Date(data.date).toLocaleDateString()}</strong> has been completed successfully.</p>
        <p>We hope you had a great journey! Please take a moment to rate your driver to help keep our community safe and reliable.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Thank you for riding with us. See you on your next trip!</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendReviewNotificationEmail(to: string, data: {
  driverName: string,
  passengerName: string,
  rating: number,
  review: string | null,
  source: string,
  destination: string,
  date: string,
}) {
  const stars = '⭐'.repeat(data.rating);
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: `You received a new review! ${stars}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto;">
        <h2 style="color: #22c55e;">You've got a new review! 🎉</h2>
        <p>Hi ${data.driverName},</p>
        <p><strong>${data.passengerName}</strong> rated your ride from <strong>${data.source?.split(',')[0]}</strong> to <strong>${data.destination?.split(',')[0]}</strong> on <strong>${new Date(data.date).toLocaleDateString()}</strong>.</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #22c55e;">
          <p style="font-size: 28px; margin: 0 0 8px;">${stars}</p>
          <p style="font-size: 18px; font-weight: bold; margin: 0 0 8px;">${data.rating} / 5</p>
          ${data.review ? `<p style="color: #555; font-style: italic;">"${data.review}"</p>` : '<p style="color: #aaa;">No written review provided.</p>'}
        </div>
        <p>To see all your reviews and ratings, visit the <strong>My Rides → History → Reviews & Ratings</strong> section in your dashboard.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">Keep providing great rides to earn more positive reviews!</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendIdCardVerificationEmail(to: string, data: {
  name: string;
  status: 'VERIFIED' | 'REJECTED';
  reason?: string;
}) {
  const isVerified = data.status === 'VERIFIED';
  const mailOptions = {
    from: smtp.fromEmail,
    to,
    subject: isVerified ? '✅ ID Card Verified — Welcome to BlinkRide!' : '❌ ID Card Verification Failed',
    html: `
      <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto;">
        <h2 style="color: ${isVerified ? '#22c55e' : '#ef4444'};">
          ${isVerified ? '✅ Your ID card has been verified!' : '❌ ID card verification failed'}
        </h2>
        <p>Hi ${data.name},</p>
        ${isVerified
        ? `<p>Your student ID card has been successfully verified. You now have full access to BlinkRide!</p>`
        : `<p>We were unable to verify your student ID card. ${data.reason ? `<br/>Reason: <strong>${data.reason}</strong>` : ''}</p>
             <p>Please contact support or re-upload a clearer image of your ID card.</p>`
      }
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">BlinkRide — Charusat Campus Carpooling</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}
