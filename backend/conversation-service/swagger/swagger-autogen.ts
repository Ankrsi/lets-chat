import swaggerAutogen from "swagger-autogen";

console.info("start swagger.");
const doc = {
  info: { title: "API", version: "1.0.0" },
  securityDefinitions: {
    apiKeyAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: "Provide your API key here, e.g. Bearer <token>",
    }
  },
  // host: "localhost:4021/api/v1",
  host: "superapp-event-service.testsdlc.in/api/v1",
  basePath: "/",
  security: [{ apiKeyAuth: [] }],
  schemes: ["http","https"],
};

const options = {
    autoHeaders: true,
    autoQuery: true,
    autoBody: true
};

const outputFile = "./swagger.json";
const endpointsFiles = ["./src/routes/index.ts"];
// const endpointsFiles = ["./src/routes/chats.route.ts", "./src/routes/contact.route.ts"];

swaggerAutogen(options)(outputFile, endpointsFiles, doc);
