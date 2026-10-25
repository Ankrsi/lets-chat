import express from "express";
import cors from "cors";
import helmet from "helmet";

import hpp from "hpp";
import morgan from "morgan";

// Global Error Handlers
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// Routes
import helloWorldRouter from "./routes/hello.route";
import routes from "./routes/index";

// DB Connection
import { connectDB } from "./config/connectDB";
import { connectRedis } from "./redis/redisClient";
import { consumeChatMessages } from "./kafka/chatConsumer";
import { contactConsumer } from "./kafka/contactConsumer";
import { startSocketServer } from "./socket";
import { apiRateLimit } from "./middlewares/rateLimit.middleware";

const app = express();

// Behind a load balancer, set TRUST_PROXY_HOPS so rate limits see the client's IP
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));


//  Secure HTTP Headers
app.use(helmet());

// Logger
app.use(morgan("dev"));

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

// Body parsers. Media goes straight to R2 (presigned URLs) and status files use multer,
// so JSON bodies stay small; 10mb leaves room for large contact syncs
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

type CustomExpress = {
  run: () => void;
} & typeof app;

// Redis, Kafka consumers, then the socket server (which owns the Kafka producer)
const start = async () => {
  await connectRedis();
  await consumeChatMessages();
  await contactConsumer();
  await startSocketServer(app);
};

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

//  Routes
app.use("/", helloWorldRouter);
app.use("/api/v1", apiRateLimit, routes);

// Invalid Path Error Handler
app.use(RouteErrorHandler);

//  Global Error Handler
app.use(ErrorHandler);

//  Run method
(app as CustomExpress).run = async () => {
  try {
    await connectDB();
    app.listen(process.env.EVENT_PORT ?? 4021, () => {
      console.info("⚙️", ` Server is running securely at port : ${process.env.EVENT_PORT ?? 4021}`);
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
