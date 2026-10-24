// import axios from "axios";
// import { ApiError } from "../utils/apiError";
// import { Socket as IOSocket } from "socket.io";

// export async function authSocket(socket: IOSocket, next:(error?: Error) => void) {
//     try {
//         const token = socket.handshake.auth?.token || socket.handshake.headers["x-auth-token"];
//         if (!token) {
//             throw new ApiError("Missing or invalid Authorization header", 403);
//         }
//         const response = await axios.get(
//             `${process.env.AUTH_SERVICE_BASE_URL}/api/v1/auth/verify-user`,
//             {
//                 headers: {
//                     Authorization: `Bearer ${token}`,
//                     "x-internal-api-key": process.env.INTERNAL_API_KEY,
//                 },
//             }
//         );
//         const payload = response.data.data;
//         if (!payload.sub) {
//             throw new ApiError("Missing or invalid Authorization header", 403);
//         }
//         socket.user = { id: payload.user.id as string };
//         next();
//     } catch (e) {
//         next(new Error(`unauthorized | ${(e as Error).message}`));
//     }
// }
