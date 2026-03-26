import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, validateConfig } from "./config.js";
import { proxmoxService } from "./services/proxmox.service.js";
import { router as containerRoutes } from "./routes/container.routes.js";
import { vmRouter } from "./routes/vm.routes.js";
import { notFoundPage, errorPage } from "./views/templates.js";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

validateConfig();

const app = express();

// Configure Pug
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views/templates"));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use("/public", express.static(path.join(__dirname, "public")));

// Request logging (infra style)
app.use((req, res, next) => {
	const timestamp = new Date().toISOString();
	console.log(`[${timestamp}] ${req.method} ${req.path}`);
	next();
});

// Mount routes
app.use("/", containerRoutes);
app.use("/", vmRouter);

// 404 handler
app.use((req, res) => {
	res.status(404).send(notFoundPage());
});

// Global error handler
app.use((err, req, res, next) => {
	console.error("Server error:", err);
	res.status(500).send(errorPage());
});

async function start() {
	try {
		await proxmoxService.connect();

		app.listen(config.server.port, () => {
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log("Proxmox Manager (LXC + VM)");
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log(`URL: http://localhost:${config.server.port}`);
			console.log(`Node: ${config.proxmox.node}`);
			console.log(`Host: ${config.proxmox.host}`);
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log("\nPress Ctrl+C to stop\n");
		});
	} catch (error) {
		console.error("Failed to start server:", error.message);
		process.exit(1);
	}
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
	console.log("\n🛑 Shutting down gracefully...");
	process.exit(0);
});

process.on("SIGINT", () => {
	console.log("\n🛑 Shutting down gracefully...");
	process.exit(0);
});

start();
