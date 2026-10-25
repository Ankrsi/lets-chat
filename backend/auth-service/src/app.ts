import express from "express";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";

// Global Error Handlers
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// Routes
import helloWorldRouter from "./routes/hello.route";
import routes from "./routes/index";

// DB Connection
import { connectDB } from "./config/connectDB";

const REQUIRED_ENV = ["MONGODB_URL", "JWT_PRIVATE_KEY", "JWT_PUBLIC_KEY", "INTERNAL_API_KEY"];

const app = express();

// Behind a reverse proxy, set TRUST_PROXY_HOPS so rate limits see the real client IP
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));

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

// Body Parser & URL encoding
app.use(express.json({ limit: "100kb" }));
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
app.use("/api/v1", routes);

// Invalid Path Error Handler
app.use(RouteErrorHandler);

//  Global Error Handler
app.use(ErrorHandler);

//  Run method
(app as CustomExpress).run = async () => {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    process.exit(1);
  }
  try {
    await connectDB();
    app.listen(process.env.AUTH_PORT ?? 4008, () => {
      console.info("⚙️", ` Server is running securely at port : ${process.env.AUTH_PORT ?? 4008}`);
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
