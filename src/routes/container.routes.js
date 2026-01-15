import express from "express";
import { proxmoxService } from "../services/proxmox.service.js";
import { containerRow, dashboardPage } from "../views/templates.js";

export const router = express.Router();

/**
 * GET /
 * Dashboard - list all containers
 */
router.get("/", async (req, res) => {
	try {
		const containers = await proxmoxService.getContainers();
		res.send(dashboardPage(containers));
	} catch (error) {
		console.error("Dashboard error:", error.message);
		res.status(500).send(`
      <html>
        <body style="font-family: monospace; padding: 20px; background: #1a1a1a; color: #e0e0e0;">
          <h1>❌ Error</h1>
          <p>${error.message}</p>
          <p style="color: #888;">Check server logs for details.</p>
        </body>
      </html>
    `);
	}
});

router.get("/health", (req, res) => {
	res.status(200).send("OK");
});

/**
 * GET /containers
 * Return only container rows for htmx polling
 */
router.get("/containers", async (req, res) => {
	try {
		const containers = await proxmoxService.getContainers();
		// Return all container rows
		const rows = containers
			.map((container) => containerRow(container))
			.join("");
		res.send(rows);
	} catch (error) {
		console.error("Containers polling error:", error.message);
		res.status(500).send("");
	}
});

/**
 * POST /containers/:vmid/start
 * Start a container and return updated row
 */
router.post("/containers/:vmid/start", async (req, res) => {
	const vmid = req.params.vmid;

	try {
		const result = await proxmoxService.startContainer(vmid);

		// Poll task until completion
		await pollTask(result.task);

		// Wait for IP address to be assigned (retry up to 5 times with 1s delay)
		let container = null;
		for (let i = 0; i < 5; i++) {
			const containers = await proxmoxService.getContainers();
			container = containers.find(
				(ct) => ct.vmid === Number.parseInt(vmid, 10),
			);

			// If container has IP or we've tried enough times, break
			if (container?.ipAddress || i === 4) {
				break;
			}

			// Wait 1 second before next attempt
			await sleep(1000);
		}

		if (container) {
			res.send(containerRow(container));
		} else {
			res.send(errorRow(vmid, "Container not found after start"));
		}
	} catch (error) {
		console.error(`Start error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /containers/:vmid/stop
 * Stop a container and return updated row
 */
router.post("/containers/:vmid/stop", async (req, res) => {
	const vmid = req.params.vmid;

	try {
		const result = await proxmoxService.stopContainer(vmid);

		// Poll task until completion
		await pollTask(result.task);

		// Fetch updated container data
		const containers = await proxmoxService.getContainers();
		const container = containers.find(
			(ct) => ct.vmid === Number.parseInt(vmid, 10),
		);

		if (container) {
			res.send(containerRow(container));
		} else {
			res.send(errorRow(vmid, "Container not found after stop"));
		}
	} catch (error) {
		console.error(`Stop error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * DELETE /containers/:vmid
 * Delete a container and remove row from table
 */
router.delete("/containers/:vmid", async (req, res) => {
	const vmid = req.params.vmid;

	try {
		const result = await proxmoxService.deleteContainer(vmid);

		// Poll task until completion
		await pollTask(result.task);

		// Return empty response - htmx will remove the row
		res.send("");
	} catch (error) {
		console.error(`Delete error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * Poll Proxmox task status until completion
 * Tasks are async operations identified by UPID
 */
async function pollTask(upid, maxAttempts = 30, interval = 500) {
	if (!upid) return;

	for (let i = 0; i < maxAttempts; i++) {
		try {
			const status = await proxmoxService.getTaskStatus(upid);

			// Task completed successfully
			if (status === "stopped") {
				return;
			}

			// Task still running
			await sleep(interval);
		} catch (_error) {
			// Task endpoint may not be available, fall back to simple wait
			await sleep(interval);
			return;
		}
	}

	// Timeout - task took too long, but don't fail
	console.warn(`Task ${upid} polling timeout, continuing anyway`);
}

/**
 * Simple sleep utility
 */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
