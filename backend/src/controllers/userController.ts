import path from 'path';
import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { getUserById, updateUserProfilePhoto, updateUiProfile, updateLicense } from '../services/userService';
import { pool } from '../db/pool';
import { verifyIdCard } from '../services/idCardVerificationService';

// ... (previous functions)

// POST /api/users/me/license
export async function uploadLicense(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { license_no, license_expiry_date } = req.body;
  if (!license_no || !license_expiry_date) {
    return res.status(400).json({ message: 'License number and expiry date are required' });
  }

  try {
    const filename = path.basename(req.file.path);
    const relativePath = `uploads/${filename}`;

    const user = await updateLicense(req.user.userId, {
      license_no,
      license_pdf: relativePath,
      license_expiry_date,
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      message: 'License uploaded successfully and is now pending verification.',
      user,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to upload license' });
  }
}

// GET /api/users/me
export async function getMe(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const user = await getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json(user);
}

// POST /api/users/me/profile-photo
export async function uploadProfilePhoto(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Store relative path like "uploads/filename.jpg"
  const filename = path.basename(req.file.path);
  const relativePath = `uploads/${filename}`;

  const user = await updateUserProfilePhoto(req.user.userId, relativePath);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    message: 'Profile photo updated',
    user,
  });
}

// PUT /api/users/me
export async function updateProfile(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const { full_name, phone, gender } = req.body;
  const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

  let profile_photo: string | undefined;
  if (files?.profile_photo?.[0]) {
    profile_photo = `uploads/${path.basename(files.profile_photo[0].path)}`;
  } else if (req.file) {
    profile_photo = `uploads/${path.basename(req.file.path)}`;
  }

  let id_card_photo: string | undefined;
  if (files?.id_card_photo?.[0]) {
    id_card_photo = `uploads/${path.basename(files.id_card_photo[0].path)}`;
  }

  const updateData: { full_name?: string; phone?: string; profile_photo?: string; gender?: string; id_card_photo?: string } = {};
  if (full_name) updateData.full_name = full_name;
  if (phone) updateData.phone = phone;
  if (profile_photo) updateData.profile_photo = profile_photo;
  if (gender) updateData.gender = gender;
  if (id_card_photo) updateData.id_card_photo = id_card_photo;

  try {
    const user = await updateUiProfile(req.user.userId, updateData);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Fire-and-forget OCR verification if a new id_card_photo was uploaded
    if (id_card_photo && user.email) {
      setImmediate(async () => {
        try {
          await verifyIdCard(user.user_id, id_card_photo!, user.email);
        } catch (e) {
          console.error('[ID Card] Background verification error (updateProfile):', e);
        }
      });
    }

    return res.json(user);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Phone number already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
}

// GET /api/users/me/dashboard
export async function getDashboardStats(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const userId = req.user.userId;

  try {
    // 1. Get stats
    const ridesOfferedResult = await pool.query(
      'SELECT COUNT(*) FROM rides WHERE driver_id = $1',
      [userId]
    );
    const ridesTakenResult = await pool.query(
      "SELECT COUNT(*) FROM bookings WHERE rider_id = $1 AND booking_status = 'CONFIRMED'",
      [userId]
    );

    // 2. Get upcoming rides (as driver or rider)
    const upcomingRidesDriverResult = await pool.query(
      `SELECT r.*, v.model as vehicle_model, v.vehicle_number 
       FROM rides r 
       JOIN vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.driver_id = $1 AND r.ride_date >= CURRENT_DATE AND r.status IN ('ACTIVE', 'STARTED')
       ORDER BY r.ride_date ASC, r.ride_time ASC LIMIT 5`,
      [userId]
    );

    const asDriver = await Promise.all(upcomingRidesDriverResult.rows.map(async (ride) => {
      const bookingsResult = await pool.query(
        `SELECT b.booking_id, b.rider_id, b.seats_booked, b.booking_status, u.full_name, u.profile_photo
         FROM bookings b
         JOIN users u ON b.rider_id = u.user_id
         WHERE b.ride_id = $1 AND b.booking_status IN ('CONFIRMED', 'PENDING')`,
        [ride.ride_id]
      );
      return { ...ride, bookings: bookingsResult.rows };
    }));

    const upcomingRidesPassengerResult = await pool.query(
      `SELECT r.*, b.booking_id, b.booking_status, u.full_name as driver_name, u.profile_photo as driver_photo
       FROM bookings b
       JOIN rides r ON b.ride_id = r.ride_id
       JOIN users u ON r.driver_id = u.user_id
       WHERE b.rider_id = $1 AND r.ride_date >= CURRENT_DATE AND b.booking_status = 'CONFIRMED' AND r.status IN ('ACTIVE', 'STARTED')
       ORDER BY r.ride_date ASC, r.ride_time ASC LIMIT 5`,
      [userId]
    );

    // 3. Get recent activity
    const recentActivity = await pool.query(
      `(SELECT 'RIDE_OFFERED' as activity_type, source, destination, created_at 
        FROM rides WHERE driver_id = $1 
        ORDER BY created_at DESC LIMIT 5)
       UNION ALL
       (SELECT 'RIDE_BOOKED' as activity_type, r.source, r.destination, b.created_at 
        FROM bookings b JOIN rides r ON b.ride_id = r.ride_id 
        WHERE b.rider_id = $1 
        ORDER BY b.created_at DESC LIMIT 5)
       ORDER BY created_at DESC LIMIT 5`,
      [userId]
    );

    // 4. Get latest notifications
    const notificationsResult = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [userId]
    );

    return res.json({
      stats: {
        ridesOffered: parseInt(ridesOfferedResult.rows[0].count),
        ridesTaken: parseInt(ridesTakenResult.rows[0].count),
        carbonSaved: parseInt(ridesTakenResult.rows[0].count) * 13, // Rough estimate: 13kg per ride
      },
      upcomingRides: {
        asDriver,
        asPassenger: upcomingRidesPassengerResult.rows,
      },
      recentActivity: recentActivity.rows,
      notifications: notificationsResult.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/users/profile/:id
export async function getPublicProfile(req: AuthedRequest, res: Response) {
  const { id } = req.params;

  try {
    const userResult = await pool.query(
      `SELECT 
        user_id, full_name, profile_photo, role, created_at, email, phone, gender,
        (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE rated_user = users.user_id) as rating,
        (SELECT COUNT(*) FROM ratings WHERE rated_user = users.user_id) as rating_count
       FROM users
       WHERE user_id = $1`,
      [id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userData = userResult.rows[0];

    // Fetch vehicles (publicly viewable info)
    const vehiclesResult = await pool.query(
      'SELECT model, vehicle_number, seats FROM vehicles WHERE user_id = $1',
      [id]
    );

    // Fetch reviews
    const reviewsResult = await pool.query(
      `SELECT 
        r.rating, r.review, r.created_at,
        u.full_name as reviewer_name, u.profile_photo as reviewer_photo
       FROM ratings r
       JOIN users u ON r.rated_by = u.user_id
       WHERE r.rated_user = $1
       ORDER BY r.created_at DESC`,
      [id]
    );

    // Fetch upcoming rides and passengers
    const ridesResult = await pool.query(
      `SELECT ride_id, source, destination, ride_date, ride_time, status
       FROM rides 
       WHERE driver_id = $1 AND status IN ('ACTIVE', 'STARTED') AND ride_date >= CURRENT_DATE
       ORDER BY ride_date ASC, ride_time ASC LIMIT 5`,
      [id]
    );

    const upcoming_rides = await Promise.all(ridesResult.rows.map(async (ride) => {
      const passengersResult = await pool.query(
        `SELECT u.user_id, u.full_name, u.profile_photo, u.gender
         FROM bookings b
         JOIN users u ON b.rider_id = u.user_id
         WHERE b.ride_id = $1 AND b.booking_status = 'CONFIRMED'`,
        [ride.ride_id]
      );
      return {
        ...ride,
        passengers: passengersResult.rows.map(p => ({
          ...p,
          profile_photo: p.profile_photo // Keep relative path
        }))
      };
    }));

    return res.json({
      ...userData,
      vehicles: vehiclesResult.rows,
      reviews: reviewsResult.rows,
      upcoming_rides
    });
  } catch (err) {
    console.error('Error fetching public profile:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function submitRating(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { ride_id, rated_user, rating, review } = req.body;

  if (!ride_id || !rated_user || !rating) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // 1. Verify that the rater has a COMPLETED booking for this ride
    // AND that the rated_user is the driver of that ride
    const bookingResult = await pool.query(
      `SELECT b.booking_id 
       FROM bookings b
       JOIN rides r ON b.ride_id = r.ride_id
       WHERE b.ride_id = $1 AND b.rider_id = $2 AND r.driver_id = $3 
       AND b.booking_status = 'COMPLETED'`,
      [ride_id, userId, rated_user]
    );

    if (bookingResult.rowCount === 0) {
      return res.status(403).json({ message: 'You can only rate drivers of rides you have completed' });
    }

    // 2. Insert the rating
    await pool.query(
      `INSERT INTO ratings (ride_id, rated_by, rated_user, rating, review)
       VALUES ($1, $2, $3, $4, $5)`,
      [ride_id, userId, rated_user, rating, review]
    );

    res.status(201).json({ message: 'Rating submitted successfully' });
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ message: 'You have already rated this user for this ride' });
    }
    console.error('Error submitting rating:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function getNotifications(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const notifications = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [userId]
    );

    res.json(notifications.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function markNotificationAsRead(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.params;

  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE notification_id = $1 AND user_id = $2',
      [id, userId]
    );

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/users/me/rides
export async function getMyRides(req: AuthedRequest, res: Response) {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // 1. Rides as Driver
    const ridesAsDriver = await pool.query(
      `SELECT r.*, v.model as vehicle_model, v.vehicle_number,
       (SELECT COUNT(*) FROM bookings WHERE ride_id = r.ride_id AND booking_status = 'CONFIRMED') as confirmed_bookings,
       COALESCE(
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'full_name', pu.full_name, 
            'profile_photo', pu.profile_photo
          ))
          FROM bookings pb
          JOIN users pu ON pb.rider_id = pu.user_id
          WHERE pb.ride_id = r.ride_id AND pb.booking_status = 'CONFIRMED'
         ), '[]'
       ) as confirmed_passengers,
       COALESCE(
         (SELECT JSON_AGG(JSON_BUILD_OBJECT(
            'booking_id', pb.booking_id,
            'full_name', pu.full_name, 
            'profile_photo', pu.profile_photo,
            'seats_booked', pb.seats_booked
          ))
          FROM bookings pb
          JOIN users pu ON pb.rider_id = pu.user_id
          WHERE pb.ride_id = r.ride_id AND pb.booking_status = 'PENDING'
         ), '[]'
       ) as pending_requests
       FROM rides r
       JOIN vehicles v ON r.vehicle_id = v.vehicle_id
       WHERE r.driver_id = $1
       ORDER BY r.ride_date DESC, r.ride_time DESC`,
      [userId]
    );

    // 2. Rides as Passenger
    const ridesAsPassenger = await pool.query(
      `SELECT r.*, b.booking_id, b.booking_status, b.seats_booked, u.full_name as driver_name, u.profile_photo as driver_photo
       FROM bookings b
       JOIN rides r ON b.ride_id = r.ride_id
       JOIN users u ON r.driver_id = u.user_id
       WHERE b.rider_id = $1
       ORDER BY r.ride_date DESC, r.ride_time DESC`,
      [userId]
    );

    // Organize into Active, History, Cancelled
    const allRides = [
      ...ridesAsDriver.rows.map(r => ({ ...r, type: 'DRIVER' })),
      ...ridesAsPassenger.rows.map(r => ({ ...r, type: 'PASSENGER' }))
    ].sort((a, b) => new Date(`${b.ride_date}T${b.ride_time}`).getTime() - new Date(`${a.ride_date}T${a.ride_time}`).getTime());

    const active = allRides.filter(r =>
      (r.status === 'ACTIVE' || r.status === 'CONFIRMED' || r.status === 'STARTED') &&
      (r.booking_status === 'CONFIRMED' || r.booking_status === 'PENDING' || r.type === 'DRIVER')
    );

    const history = allRides.filter(r => r.status === 'COMPLETED' || r.booking_status === 'COMPLETED');

    const cancelled = allRides.filter(r => r.status === 'CANCELLED' || r.booking_status === 'CANCELLED');

    res.json({ active, history, cancelled });
  } catch (error) {
    console.error('Error fetching my rides:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
