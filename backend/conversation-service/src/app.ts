import express from "express";
import cors from "cors";
import helmet from "helmet";

import hpp from "hpp";
import morgan from "morgan";

// Global Error Handlers
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";
import fareQuoteController from "./controllers/fareQuote.controller";

// Routes
import helloWorldRouter from "./routes/hello.route";
import routes from "./routes/index";
import supportRoute from "./routes/support.route";
import taxiRoute from "./routes/taxi.route";
import webhooks from "./routes/webhook.routes";

// setups swagger
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import basicAuth from "express-basic-auth";

// DB Connection
import { connectDB } from "./config/connectDB";
import { connectProducer } from "./kafka/kafkaProducer";
import { connectRedis } from "./redis/redisClient";
import { startRideOfferExpirySubscriber } from "./redis/rideOfferExpiry.subscriber";
import { consumeLocationUpdates } from "./kafka/locationConsumer";
import { consumeChatMessages } from "./kafka/chatConsumer";
import { startSocketServer } from "./socket";
// import { verifyUser } from "./middlewares/verifyUser";
import UsersRouter from "./routes/utility.route";
import { publishEvent } from "./controllers/event.controller";
import { driverLocationConsumer } from "./kafka/taxiconsumers/driverLocationConsumer";
import { driverGeoKafkaConsumer } from "./kafka/taxiconsumers/driverGeoKafkaConsumer";
import { rideStatusConsumer } from "./kafka/taxiconsumers/rideStatusConsumer";
import { liveFareConsumer } from "./kafka/taxiconsumers/liveFareConsumer";
import { walletEventConsumer } from "./kafka/eventConsumer";
import { consumePoolRideCoordinates } from "./kafka/taxiconsumers/pool/poolRideCoordinateConsumer";
import { poolAcceptConsumer } from "./kafka/taxiconsumers/pool/poolAcceptConsumer";
import { contactConsumer } from "./kafka/contactConsumer";
import { consumeOrderSettlements } from "./kafka/orderSettlementConsumer";
import { consumeOrderRetries } from "./kafka/orderRetryConsumer";
// import { consumeOrderDlq } from "./kafka/orderDlqConsumer";
// import transactionRoute from "./routes/transaction.route";
import { languageMiddleware } from "./middlewares/language.middleware";
import mediasoupMetrics from "./socket/mediasoupMetrics";
import { orderLocationConsumer } from "./kafka/taxiconsumers/ecommerce/orderLocationConsumer";
import { orderStatusConsumer } from "./kafka/taxiconsumers/ecommerce/orderStatusConsumer";
import { deliveryLocationConsumer } from "./kafka/taxiconsumers/ecommerce/deliveryLocationConsumer";

const app = express();

app.use(express.static("./public"));

//  Secure HTTP Headers
app.use(helmet());

// app.use(
//   helmet.contentSecurityPolicy({
//     useDefaults: true,
//     directives: {
//       "default-src": ["'self'"],
//       "script-src": ["'self'", "http://localhost:4022", "https://unpkg.com"], // no inline scripts
//       "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com"],
//       "img-src": ["'self'", "data:", "https://*.tile.openstreetmap.org"],
//       "connect-src": ["'self'", "ws:", "wss:", "http://localhost:4022", "ws://localhost:4022", "https://unpkg.com"],
//     },
//   })
// )

// app.use(
//   cors({
//     origin: ["http://superapp-tracker.testsdlc.in/","http://localhost:3000"], // allow your separate frontend
//     credentials: true,
//   }),
// );

app.use(languageMiddleware);

// run swagger
(async () => {
  try {
    const swaggerDoc = JSON.parse(fs.readFileSync("swagger/swagger.json", "utf-8"));
    app.use(
      "/api-docs",
      basicAuth({
        users: { admin: process.env.API_DOCS_PASSWORD as string },
        challenge: true,
      }),
      swaggerUi.serve,
      swaggerUi.setup(swaggerDoc, {
        customSiteTitle: "Conversaction API Docs",
        customCss: `
          .swagger-ui .topbar {
            display: none;
          }
        `,
        customfavIcon: "/favicon.ico",
      }),
    );
  } catch (err) {
    console.info("swagger: ", err);
  }
})();

// Logger
app.use(morgan("dev"));

// Remove X-Powered-By (hides Express info)
app.disable("x-powered-by");

// app.set('trust proxy', true);

// Secure CORS config (allow specific origin in production)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  }),
);

//  Prevent HTTP Parameter Pollution
app.use(hpp());

// Rate Limiting (basic - 100 requests per 15 minutes)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP
//   message: "Too many requests from this IP, please try again later",
//   standardHeaders: true,
//   legacyHeaders: false,
// });
// app.use(limiter);

// Body Parser & URL encoding
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

type CustomExpress = {
  run: () => void;
} & typeof app;

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.info(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

const start = async () => {
  await connectProducer();
  await connectRedis();
  await consumeChatMessages();
  await contactConsumer();
  await consumeLocationUpdates();
  await driverLocationConsumer(); // new taxi driver location consumer
  await driverGeoKafkaConsumer(); // new taxi driver GEO consumer
  await rideStatusConsumer(); // new taxi ride status consumer
  await liveFareConsumer(); // new taxi live fare consumer
  await walletEventConsumer(); // wallet event consumer
  await consumePoolRideCoordinates(); // pool ride coordinate consumer
  await poolAcceptConsumer(); // pool accept consumer
  await consumeOrderSettlements(); // e-commerce order payment settlement
  await consumeOrderRetries(); // e-commerce order payment retry
  // await consumeOrderDlq();        // e-commerce order payment DLQ + wallet refund
  await orderLocationConsumer(); // e-commerce order location consumer
  await deliveryLocationConsumer(); // e-commerce delivery partner location consumer
  await orderStatusConsumer(); // e-commerce order status consumer
  await startRideOfferExpirySubscriber(); // sequential ride dispatch — offer timeout events

  startSocketServer(app);
};

start();

//  Routes
app.use("/", helloWorldRouter);
app.use("/api/v1", routes);
app.use("/api/v1/support", supportRoute);
app.use(fareQuoteController);
app.use("/api/v1/utility", UsersRouter);
app.post("/api/v1/events/publish", publishEvent);
app.use("/api/v1/taxi", taxiRoute);
app.use("/api/v1/webhook", webhooks);
app.use("/monitoring", mediasoupMetrics);
// Serve public share page: /track/:token
// app.get("/track/:token", (req, res) => {
//   res.sendFile("track.html", { root: process.cwd() + "/public" });
// });
// app.use("/api/v1/transactions",transactionRoute);

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
