import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { pool } from '../db/pool';

export async function createTemplate(req: AuthedRequest, res: Response) {
    const userId = req.user?.userId;

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const {
            source, destination, source_lat, source_lng, dest_lat, dest_lng,
            ride_time, total_seats, base_price, route_polyline, stops,
            vehicle_id, booking_type
        } = req.body;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const templateInsertResult = await client.query(
                `INSERT INTO ride_template (
          user_id, source, destination, 
          source_lat, source_lng, dest_lat, dest_lng, 
          ride_time, total_seats, base_price, 
          vehicle_id, booking_type, route_polyline
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING template_id`,
                [
                    userId, source, destination,
                    source_lat, source_lng, dest_lat, dest_lng,
                    ride_time, total_seats, base_price,
                    vehicle_id, booking_type || 'INSTANT', route_polyline
                ]
            );

            const templateId = templateInsertResult.rows[0].template_id;

            if (stops && Array.isArray(stops)) {
                for (const stop of stops) {
                    await client.query(
                        `INSERT INTO stops (
              parent_type, parent_id, city_name, 
              latitude, longitude, stop_order, stop_price
            ) VALUES ('TEMPLATE', $1, $2, $3, $4, $5, $6)`,
                        [templateId, stop.city_name, stop.latitude, stop.longitude, stop.stop_order, stop.stop_price]
                    );
                }
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Template saved successfully!', templateId });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getMyTemplates(req: AuthedRequest, res: Response) {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const templatesResult = await pool.query(
            `SELECT t.*, v.model as vehicle_model, v.vehicle_number 
       FROM ride_template t 
       LEFT JOIN vehicles v ON t.vehicle_id = v.vehicle_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
            [userId]
        );

        const templatesWithStops = await Promise.all(templatesResult.rows.map(async (template) => {
            const stopsResult = await pool.query(
                'SELECT * FROM stops WHERE parent_id = $1 AND parent_type = \'TEMPLATE\' ORDER BY stop_order ASC',
                [template.template_id]
            );
            return { ...template, stops: stopsResult.rows };
        }));

        res.json(templatesWithStops);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

export async function deleteTemplate(req: AuthedRequest, res: Response) {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM ride_template WHERE template_id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Template not found or unauthorized' });
        }

        res.json({ message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}
