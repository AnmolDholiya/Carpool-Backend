import { Response } from 'express';
import { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';

// Get all users (admin only)
export async function getAllUsers(req: AuthedRequest, res: Response) {
    try {
        const result = await pool.query(
            `SELECT user_id, full_name, email, phone, role, profile_photo, email_verified, license_status, created_at
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

        return res.json({
            message: `License ${status.toLowerCase()} successfully`,
            user: result.rows[0],
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Failed to verify license' });
    }
}
