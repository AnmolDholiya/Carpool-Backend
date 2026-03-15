import type { Request, Response } from 'express';
import * as vehicleService from '../services/vehicleService';

export async function addVehicle(req: Request, res: Response) {
  const { vehicle_number, model, seats } = req.body;
  const userId = (req as any).user.userId;

  if (!vehicle_number || !model || !seats) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const vehicle = await vehicleService.createVehicle(userId, { vehicle_number, model, seats });
    return res.status(201).json(vehicle);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Vehicle number already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Failed to add vehicle' });
  }
}

export async function getMyVehicles(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { ride_date, ride_time } = req.query;

  try {
    const vehicles = await vehicleService.getUserVehicles(
      userId,
      ride_date as string,
      ride_time as string
    );
    return res.json(vehicles);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to get vehicles' });
  }
}

export async function removeVehicle(req: Request, res: Response) {
  const userId = (req as any).user.userId;
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Vehicle ID is required' });
  }

  try {
    const success = await vehicleService.deleteVehicle(userId, parseInt(id as string));
    if (!success) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    return res.json({ message: 'Vehicle removed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to remove vehicle' });
  }
}


