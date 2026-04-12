/**
 * Socket.IO Service for Real-time Notifications
 * Integrates with Cloudflare Workers using Durable Objects
 */

export class SocketService {
  constructor(env) {
    this.env = env;
    this.connections = new Map(); // Store active connections
  }

  // Initialize Socket.IO-like functionality for Cloudflare Workers
  async handleWebSocket(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection
    server.accept();

    // Handle WebSocket events
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleMessage(server, data);
      } catch (error) {
        console.error('WebSocket message error:', error);
        server.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    server.addEventListener('close', () => {
      this.handleDisconnect(server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Handle incoming WebSocket messages
  async handleMessage(socket, data) {
    const { type, payload } = data;

    switch (type) {
      case 'join_room':
        await this.joinRoom(socket, payload.room, payload.userId, payload.userType);
        break;
      case 'leave_room':
        await this.leaveRoom(socket, payload.room);
        break;
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.log('Unknown message type:', type);
    }
  }

  // Join a notification room (e.g., 'admin', 'partner_123', 'customer_456')
  async joinRoom(socket, room, userId, userType) {
    socket.room = room;
    socket.userId = userId;
    socket.userType = userType;
    
    this.connections.set(socket, { room, userId, userType });
    
    socket.send(JSON.stringify({
      type: 'joined_room',
      room: room,
      message: `Joined ${room} successfully`
    }));

    console.log(`User ${userId} (${userType}) joined room: ${room}`);
  }

  // Leave a room
  async leaveRoom(socket, room) {
    this.connections.delete(socket);
    socket.send(JSON.stringify({
      type: 'left_room',
      room: room
    }));
  }

  // Handle disconnect
  handleDisconnect(socket) {
    this.connections.delete(socket);
    console.log('Client disconnected');
  }

  // Send notification to specific room
  async sendToRoom(room, notification) {
    let sentCount = 0;
    
    for (const [socket, connection] of this.connections.entries()) {
      if (connection.room === room) {
        try {
          socket.send(JSON.stringify({
            type: 'new_notification',
            notification
          }));
          sentCount++;
        } catch (error) {
          console.error('Failed to send notification:', error);
          this.connections.delete(socket);
        }
      }
    }

    console.log(`📡 Sent notification to ${sentCount} clients in room: ${room}`);
    return sentCount;
  }

  // Send notification to specific user
  async sendToUser(userId, userType, notification) {
    const room = `${userType}_${userId}`;
    return await this.sendToRoom(room, notification);
  }

  // Send notification to all admins
  async sendToAdmins(notification) {
    return await this.sendToRoom('admin', notification);
  }

  // Broadcast to all connected clients
  async broadcast(notification) {
    let sentCount = 0;
    
    for (const [socket] of this.connections.entries()) {
      try {
        socket.send(JSON.stringify({
          type: 'broadcast_notification',
          notification
        }));
        sentCount++;
      } catch (error) {
        console.error('Failed to broadcast notification:', error);
        this.connections.delete(socket);
      }
    }

    console.log(`📡 Broadcasted notification to ${sentCount} clients`);
    return sentCount;
  }

  // Get connection stats
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      roomStats: {}
    };

    for (const [, connection] of this.connections.entries()) {
      const room = connection.room;
      stats.roomStats[room] = (stats.roomStats[room] || 0) + 1;
    }

    return stats;
  }
}

// Helper function to send notifications via WebSocket
export async function sendRealtimeNotification(env, notification) {
  if (!env.socketService) {
    console.warn('Socket service not initialized');
    return false;
  }

  const { recipientId, recipientType } = notification;
  
  try {
    // Send to specific user
    if (recipientId && recipientType) {
      if (recipientType === 'admin') {
        await env.socketService.sendToAdmins(notification);
      } else {
        await env.socketService.sendToUser(recipientId, recipientType, notification);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send real-time notification:', error);
    return false;
  }
}
