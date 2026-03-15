import express from 'express';
import cors from 'cors';
import path from 'path';
import router from './routes';
import { errorHandler } from './middleware/errorHandler';
import { getConfig } from './config/config';

import { createServer } from 'http';
import { Server } from 'socket.io';

const config = getConfig();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Enable CORS for frontend
app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.get('/', (_req, res) => {
  res.send('Carpooling API is running with Live Tracking');
});

// Serve uploaded profile photos
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api', router);

app.use(errorHandler);

// Socket.io Logic for Live Tracking & Presence
const onlineUsers = new Map<number, string>(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('User connected to socket:', socket.id);

  socket.on('identify', (userId: number) => {
    onlineUsers.set(userId, socket.id);
    console.log(`User ${userId} identified with socket ${socket.id}`);

    // Broadcast to all that this user is online
    io.emit('user-online', userId);

    // Send the current list of online users to the newly connected user
    socket.emit('online-users-list', Array.from(onlineUsers.keys()));
  });

  socket.on('join-ride', (rideId: string) => {
    socket.join(`ride-${rideId}`);
    console.log(`Socket ${socket.id} joined ride-${rideId}`);
  });

  socket.on('update-location', (data: { rideId: string; lat: number; lng: number }) => {
    // Broadcast location to everyone in the ride room EXCEPT the sender (the driver)
    socket.to(`ride-${data.rideId}`).emit('location-updated', {
      lat: data.lat,
      lng: data.lng,
    });
  });

  socket.on('disconnect', () => {
    let disconnectedUserId: number | null = null;
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      console.log(`User ${disconnectedUserId} went offline`);
      io.emit('user-offline', disconnectedUserId);
    }
    console.log('User disconnected from socket:', socket.id);
  });
});

httpServer.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});