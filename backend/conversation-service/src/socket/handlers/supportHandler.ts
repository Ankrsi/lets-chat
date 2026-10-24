import { Socket, Server } from "socket.io";
import { SocketSupportService } from "../../services/support/writeTODbSocket.service";
/**
 * Support Ticket Socket.IO Handlers
 * Handles real-time chat for support tickets
 */

export const supportSocket = (socket: Socket, io: Server) => {
    //   const supportNamespace = io.of('/support');
    socket.on('user:join-ticket', async (data: { ticketId: string }) => {
        try {
            const { ticketId } = data;

            // Store user info in socket
            socket.user.userId = socket.user._id;
            socket.user.userRole = socket.user.role;

            // Join ticket-specific room
            socket.join(`ticket:${ticketId}`);

            console.info(`[Support] ${socket.user.userRole} ${socket.user.userId} joined ticket ${ticketId}`);

            // Notify others in the room
            socket.to(`ticket:${ticketId}`).emit('user:joined', {
                userId: socket.user.userId,
                userRole: (socket.user.userRole == 'individual' || socket.user.userRole == 'taxi_driver') ? 'USER' : 'AGENT',
                timestamp: new Date(),
                message: `${(socket.user.userRole == 'individual' || socket.user.userRole == 'taxi_driver') ? 'User' : 'Agent'} has joined the conversation`,
            });

            // Send acknowledgement
            socket.emit('join:success', {
                success: true,
                ticketId,
                message: 'Connected to ticket',
            });
        } catch (error) {
            socket.emit('error', {
                code: 'JOIN_FAILED',
                message: error instanceof Error ? error.message : 'Failed to join ticket',
            });
        }
    });

    /**
     * Event: message:send
     * Send a message in a ticket
     * Data: { ticketId, message, image? }
     */
    socket.on('message:send', async (data: { ticketId: string; message: string; image?: string }) => {
        try {
            const { ticketId, image } = data;
            const message = data.message || '';
            const userId = socket.user.userId;
            const userRole = socket.user.userRole;
            console.info(`[Support] Sending message in ticket ${ticketId} by ${userRole} ${userId}`);

            if (!userId || !userRole) {
                socket.emit('error', { code: 'UNAUTHORIZED', message: 'User not authenticated' });
                return;
            }

            // Save message to database
            const savedMessage = await SocketSupportService.addMessage({
                ticket_id: ticketId,
                sender_type: (userRole == 'individual' || userRole == 'taxi_driver') ? 'USER' : 'AGENT',
                sender_id: userId,
                message,
                image,
            });

            const messagePayload = {
                messageId: savedMessage._id,
                ticketId,
                sender: {
                    id: userId,
                    role: (userRole == 'individual' || userRole == 'taxi_driver') ? 'USER' : 'AGENT',
                },
                message,
                image: image || null,
                createdAt: savedMessage.created_at,
                readBy: [],
            };

            // Emit to room (public messages) or specific user (private)
            io.to(`ticket:${ticketId}`).emit('message:received', messagePayload);

            console.info(`[Support] Message sent in ticket ${ticketId} by ${userRole} ${userId}`);
        } catch (error) {
            socket.emit('error', {
                code: 'MESSAGE_FAILED',
                message: error instanceof Error ? error.message : 'Failed to send message',
            });
        }
    });

    /**
     * Event: message:read
     * Mark message as read
     * Data: { messageId }
     */
    // socket.on('message:read', async (data: { messageId: string }) => {
    //     try {
    //         const { messageId } = data;
    //         const userId = socket.user.userId;

    //         if (!userId) {
    //             socket.emit('error', { code: 'UNAUTHORIZED', message: 'User not authenticated' });
    //             return;
    //         }

    //         // Mark message as read in database
    //         await SupportService.markMessageAsRead(messageId, userId);

    //         // Get all read receipts for the message
    //         socket.emit('message:read-receipt', {
    //             messageId,
    //             readBy: userId,
    //             timestamp: new Date(),
    //         });

    //         console.info(`[Support] Message ${messageId} marked as read by ${userId}`);
    //     } catch (error) {
    //         socket.emit('error', {
    //             code: 'READ_FAILED',
    //             message: error instanceof Error ? error.message : 'Failed to mark message as read',
    //         });
    //     }
    // });

    /**
     * Event: user:typing
     * Broadcast that user is typing
     * Data: { ticketId }
     */
    // socket.on('user:typing', (data: { ticketId: string }) => {
    //     try {
    //         const { ticketId } = data;
    //         const userId = socket.user.userId;
    //         const userRole = socket.user.userRole;

    //         // Broadcast to others in the room
    //         socket.to(`ticket:${ticketId}`).emit('user:typing', {
    //             userId,
    //             userRole,
    //             timestamp: new Date(),
    //         });
    //     } catch (error) {
    //         console.error('[Support] Typing event error:', error);
    //     }
    // });

    /**
     * Event: user:stop-typing
     * Broadcast that user stopped typing
     * Data: { ticketId }
     */
    // socket.on('user:stop-typing', (data: { ticketId: string }) => {
    //     try {
    //         const { ticketId } = data;
    //         const userId = socket.user.userId;

    //         socket.to(`ticket:${ticketId}`).emit('user:stop-typing', {
    //             userId,
    //             timestamp: new Date(),
    //         });
    //     } catch (error) {
    //         console.error('[Support] Stop typing event error:', error);
    //     }
    // });

    /**
     * Event: ticket:status-change
     * Update ticket status in real-time
     * Data: { ticketId, newStatus, remarks }
     */
    // socket.on('ticket:status-change', async (data: { ticketId: string; newStatus: string; remarks?: string }) => {
    //     try {
    //         const { ticketId, newStatus, remarks } = data;
    //         const userId = socket.user.userId;
    //         const userRole = socket.user.userRole;

    //         if (userRole !== 'AGENT') {
    //             socket.emit('error', { code: 'FORBIDDEN', message: 'Only agents can change ticket status' });
    //             return;
    //         }

    //         // Update status in database
    //         await SupportService.updateTicketStatus(ticketId, newStatus as any, userId!, remarks);

    //         // Broadcast to all in the room
    //         //   supportNamespace.to(`ticket:${ticketId}`).emit('ticket:status-changed', {
    //         //     ticketId,
    //         //     newStatus,
    //         //     changedBy: userId,
    //         //     changedAt: new Date(),
    //         //     remarks,
    //         //   });
    //         io.to(`ticket:${ticketId}`).emit('ticket:status-changed', {
    //             ticketId,
    //             newStatus,
    //             changedBy: userId,
    //             changedAt: new Date(),
    //             remarks,
    //         });

    //         console.info(`[Support] Ticket ${ticketId} status changed to ${newStatus} by ${userId}`);
    //     } catch (error) {
    //         socket.emit('error', {
    //             code: 'STATUS_CHANGE_FAILED',
    //             message: error instanceof Error ? error.message : 'Failed to change ticket status',
    //         });
    //     }
    // });

    /**
     * Event: user:leave-ticket
     * User leaves a ticket room
     * Data: { ticketId }
     */
    // socket.on('user:leave-ticket', (data: { ticketId: string }) => {
    //     try {
    //         const { ticketId } = data;
    //         const userId = socket.user.userId;
    //         const userRole = socket.user.userRole;

    //         socket.leave(`ticket:${ticketId}`);

    //         // Notify others in the room
    //         socket.to(`ticket:${ticketId}`).emit('user:left', {
    //             userId,
    //             userRole,
    //             timestamp: new Date(),
    //             message: `${userRole} has left the conversation`,
    //         });

    //         console.info(`[Support] ${userRole} ${userId} left ticket ${ticketId}`);
    //     } catch (error) {
    //         console.error('[Support] Leave event error:', error);
    //     }
    // });

    /**
     * Event: disconnect
     * Handle user disconnect
     */
    socket.on('disconnect', () => {
        console.info(`[Support] User disconnected: ${socket.id}`);
    });

    /**
     * Error handler
     */
    socket.on('error', (error) => {
        console.error('[Support] Socket error:', error);
    });
};
