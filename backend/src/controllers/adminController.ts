import { Response } from 'express';
import { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';

// Get all users (admin only)
export async function getAllUsers(req: AuthedRequest, res: Response) {
    try {
        const result = await pool.query(
            `SELECT user_id, full_name, email, phone, role, profile_photo,
                    email_verified, license_status, license_no, license_pdf,
                    license_expiry_date, gender,
                    id_card_photo, id_card_status, id_card_verified_at,
                    created_at
             FROM users
             ORDER BY created_at DESC`
        );

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch users' });
    }
}

// Update user role (admin only)
export async function updateUserRole(req: AuthedRequest, res: Response) {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['USER', 'ADMIN'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role. Must be USER or ADMIN' });
    }

    try {
        const result = await pool.query(
            `UPDATE users
       SET role = $1
       WHERE user_id = $2
       RETURNING user_id, full_name, email, role`,
            [role, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to update user role' });
    }
}

// Delete user (admin only)
export async function deleteUser(req: AuthedRequest, res: Response) {
    const { userId } = req.params as { userId: string };

    // Prevent admin from deleting themselves
    if (req.user && parseInt(userId) === req.user.userId) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    try {
        const result = await pool.query(
            `DELETE FROM users WHERE user_id = $1 RETURNING user_id`,
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        return res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to delete user' });
    }
}

// Get users with pending licenses (admin only)
export async function getPendingLicenses(req: AuthedRequest, res: Response) {
    try {
        const result = await pool.query(
            `SELECT user_id, full_name, email, license_no, license_pdf, license_expiry_date, license_status
             FROM users
             WHERE license_status = 'PENDING'
             ORDER BY created_at ASC`
        );

        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch pending licenses' });
    }
}

// Verify user license (admin only)
export async function verifyLicense(req: AuthedRequest, res: Response) {
    const { userId } = req.params as { userId: string };
    const { status } = req.body;

    if (!status || !['VERIFIED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be VERIFIED or REJECTED' });
    }

    try {
        const result = await pool.query(
            `UPDATE users
             SET license_status = $1, 
                 license_verified_at = CASE WHEN $2 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE license_verified_at END
             WHERE user_id = $3
             RETURNING user_id, full_name, email, license_status`,
            [status, status, parseInt(userId)]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send notification to user
        const notificationType = status === 'VERIFIED' ? 'LICENSE_VERIFIED' : 'LICENSE_REJECTED';
        const notificationMessage = status === 'VERIFIED'
            ? 'Your driving license has been verified successfully. You can now publish rides!'
            : 'Your driving license verification was rejected. Please re-upload a clear document.';

        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [parseInt(userId), notificationType, notificationMessage]
        );

        return res.json({
            message: `License ${status.toLowerCase()} successfully`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to verify license' });
    }
}

// Get users with pending ID card verifications (admin only)
export async function getPendingIdCards(req: AuthedRequest, res: Response) {
    try {
        const result = await pool.query(
            `SELECT user_id, full_name, email, id_card_photo, id_card_status, created_at
             FROM users
             WHERE id_card_status = 'PENDING'
             ORDER BY created_at ASC`
        );
        return res.json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch pending ID cards' });
    }
}

// Approve or reject a user's ID card (admin only)
export async function verifyIdCardAdmin(req: AuthedRequest, res: Response) {
    const { userId } = req.params as { userId: string };
    const { status, reason } = req.body;

    if (!status || !['VERIFIED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be VERIFIED or REJECTED' });
    }

    try {
        const result = await pool.query(
            `UPDATE users
             SET id_card_status = $1,
                 id_card_verified_at = CASE WHEN $2 = 'VERIFIED' THEN CURRENT_TIMESTAMP ELSE id_card_verified_at END
             WHERE user_id = $3
             RETURNING user_id, full_name, email, id_card_status`,
            [status, status, parseInt(userId)]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Notify user by email (non-fatal)
        try {
            const { sendIdCardVerificationEmail } = await import('../services/emailService');
            const u = result.rows[0];
            await sendIdCardVerificationEmail(u.email, {
                name: u.full_name,
                status,
                reason: reason || undefined,
            });
        } catch (emailErr) {
            console.error('Email notification failed (non-fatal):', emailErr);
        }

        return res.json({
            message: `ID card ${status.toLowerCase()} successfully`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to update ID card status' });
    }
}

// Re-trigger OCR verification for an existing id_card_photo (admin only or self-service)
export async function reVerifyIdCard(req: AuthedRequest, res: Response) {
    const { userId } = req.params as { userId: string };

    try {
        const result = await pool.query(
            'SELECT user_id, email, id_card_photo FROM users WHERE user_id = $1',
            [parseInt(userId)]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = result.rows[0];

        if (!user.id_card_photo) {
            return res.status(400).json({ message: 'No ID card photo on file for this user' });
        }

        // Fire-and-forget import and run
        const { verifyIdCard } = await import('../services/idCardVerificationService');
        setImmediate(async () => {
            try {
                await verifyIdCard(user.user_id, user.id_card_photo, user.email);
            } catch (e) {
                console.error('[ID Card] Re-verify error:', e);
            }
        });

        return res.json({ message: 'ID card re-verification triggered. Check status in a few seconds.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to trigger re-verification' });
    }
}

// Get full details (vehicles, ratings) for a user (admin only)
export async function getUserFullDetails(req: AuthedRequest, res: Response) {
    const { userId } = req.params;

    try {
        const vehiclesPromise = pool.query(
            'SELECT vehicle_id, vehicle_number, model, seats, created_at FROM vehicles WHERE user_id = $1',
            [userId]
        );

        const ratingsPromise = pool.query(
            `SELECT r.rating_id, r.rating, r.review, r.created_at, 
                    u.full_name as rated_by_name, u.profile_photo as rated_by_photo
             FROM ratings r
             JOIN users u ON r.rated_by = u.user_id
             WHERE r.rated_user = $1
             ORDER BY r.created_at DESC`,
            [userId]
        );

        const [vehiclesResult, ratingsResult] = await Promise.all([vehiclesPromise, ratingsPromise]);

        return res.json({
            vehicles: vehiclesResult.rows,
            ratings: ratingsResult.rows
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to fetch user details' });
    }
}
