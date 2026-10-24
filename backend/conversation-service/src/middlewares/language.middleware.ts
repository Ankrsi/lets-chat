export const languageMiddleware = (req: any, res: any, next: any) => {
  req.language = req.headers["x-lang"] || "en";
  // console.log(`Language set to: ${req.language}`);
  next();
};