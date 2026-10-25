import express from "express";
import cors from "cors";
import helmet from "helmet";

import hpp from "hpp";

// Global Error Handlers
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// Routes
import helloWorldRouter from "./routes/hello.route";
import fcmRoute from "./routes/fcm.route";

const app = express();

//  Secure HTTP Headers
app.use(helmet());

// Remove X-Powered-By (hides Express info)
app.disable("x-powered-by");

// Secure CORS config (allow specific origin in production)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }),
);

//  Prevent HTTP Parameter Pollution
app.use(hpp());

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

//  Routes
app.use("/", helloWorldRouter);
app.use("/api/v1/fcm", fcmRoute);

// Invalid Path Error Handler
app.use(RouteErrorHandler);

//  Global Error Handler
app.use(ErrorHandler);

//  Run method
(app as CustomExpress).run = () => {
  app.listen(process.env.FCM_PORT ?? 4019, () => {
    console.info("⚙️", ` Server is running securely at port : ${process.env.FCM_PORT ?? 4019}`);
  });
};

export default app as CustomExpress;
