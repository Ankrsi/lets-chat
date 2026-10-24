import express from "express";
import cors from "cors";
import helmet from "helmet";
// import rateLimit from "express-rate-limit";
import hpp from "hpp";

// Global Error Handlers
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// Routes
import helloWorldRouter from "./routes/hello.route";
// import encryptDataRouter from "./routes/encryptData.route";
import endToEndRouter from "./routes/endToEnd.route";

// DB Connection
import { connectDB } from "./config/connectDB";
import { initKeys } from "./utils/rsaKeys";
// import path from "path";

const app = express();

//  Secure HTTP Headers
app.use(helmet());

// Remove X-Powered-By (hides Express info)
app.disable("x-powered-by");

// Secure CORS config (allow specific origin in production)
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  credentials: true,
}));

//  Prevent HTTP Parameter Pollution
app.use(hpp());

// // Rate Limiting (basic - 100 requests per 15 minutes)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP
//   message: "Too many requests from this IP, please try again later",
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use(limiter);

// Body Parser & URL encoding
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

type CustomExpress = {
  run: () => void;
} & typeof app;

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.info(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// generate Keys
(async() => {
  await initKeys();
})()

//  Routes
app.use("/", helloWorldRouter);
// app.use("/api/v1/encryptData", encryptDataRouter);
app.use("/api/v1/endToEnd", endToEndRouter);

// Invalid Path Error Handler
app.use(RouteErrorHandler);

//  Global Error Handler
app.use(ErrorHandler);

//  Run method
(app as CustomExpress).run = async () => {
  try {
    await connectDB();
    app.listen(process.env.ENCRYPT_PORT ?? 4025, () => {
      console.info(
        "⚙️",
        ` Server is running securely at port : ${process.env.ENCRYPT_PORT ?? 4025}`
      );
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
