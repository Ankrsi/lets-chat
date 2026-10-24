// import { createHmac } from 'crypto';
// import { Request, Response } from "express";
// import turnEnv from '../config/turnEnv';

// export function issueTurnCredentials(req: Request, res: Response) {
//   const ttlSeconds = 3600; // 1 hour
//   const username = Math.floor(Date.now() / 1000) + ttlSeconds; // expiry timestamp
//   const hmac = createHmac("sha1", turnEnv.TURN_AUTH_SECRET || "");
//   hmac.update(String(username));
//   const credential = hmac.digest("base64");

//   res.status(200).json({
//     urls: turnEnv.TURN_URLS,
//     username: String(username),
//     credential,
//     realm: turnEnv.TURN_REALM,
//     ttl: ttlSeconds
//   });
// }
