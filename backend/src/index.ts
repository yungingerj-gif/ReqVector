import express from "express";
import cors from "cors";
import requirementsSystem from "./routes/requirementsSystem";
import requirementsStakeholder from "./routes/requirementsStakeholder";
import requirementsSubsystem from "./routes/requirementsSubsystem";
import requirementsComponent from "./routes/requirementsComponent";
import requirementsImplementation from "./routes/requirementsImplementation";
import layeredPlatform from "./routes/layeredPlatform";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "ReqVector API" });
});

app.use("/api", requirementsSystem);
app.use("/api", requirementsStakeholder);
app.use("/api", requirementsSubsystem);
app.use("/api", requirementsComponent);
app.use("/api", requirementsImplementation);
app.use("/api", layeredPlatform);

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "not_found",
    method: req.method,
    path: req.originalUrl,
    hint: "Layered: GET /api/layered/health, POST /api/layered/analyze. Classic: POST /api/requirements/analyze.",
  });
});

app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
);

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});

