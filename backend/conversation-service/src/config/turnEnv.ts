// // src/config/env.ts
// import dotenv from "dotenv";
// import path from "path";

// dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// function required(name: string, val?: string) {
//   if (!val) throw new Error(`Missing env ${name}`);
//   return val;
// }

// export const turnEnv = {
//   TURN_REALM: required("TURN_REALM", process.env.TURN_REALM),
//   TURN_AUTH_SECRET: required("TURN_AUTH_SECRET", process.env.TURN_AUTH_SECRET),
//   TURN_URLS: (process.env.TURN_URLS || "").split(",").map(s => s.trim()).filter(Boolean),
// };

// export default turnEnv;
