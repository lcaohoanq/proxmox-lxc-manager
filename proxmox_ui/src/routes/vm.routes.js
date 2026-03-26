import express from "express";
import { proxmoxService } from "../services/proxmox.service.js";
import {
	vmRow,
	vmsTableView,
	vmDetailView,
	vmSnapshotsView,
	errorRow,
} from "../views/templates.js";

export const vmRouter = express.Router();

/**
 * GET /vms-table
 * Full VM table for htmx tab switching
 */
vmRouter.get("/vms-table", async (req, res) => {
	try {
		const vms = await proxmoxService.getVMs();
		res.send(vmsTableView(vms));
	} catch (error) {
		console.error("VMs table error:", error.message);
		res.status(500).send(`<div class="error">Failed to load VMs</div>`);
	}
});

/**
 * GET /vms
 * VM rows only for htmx polling
 */
vmRouter.get("/vms", async (req, res) => {
	try {
		const vms = await proxmoxService.getVMs();
		const rows = vms.map((vm) => vmRow(vm)).join("");
		res.send(rows);
	} catch (error) {
		console.error("VMs polling error:", error.message);
		res.status(500).send("");
	}
});

/**
 * GET /vms/:vmid
 * VM detail panel (config + status)
 */
vmRouter.get("/vms/:vmid", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const [cfg, status, vms] = await Promise.all([
			proxmoxService.getVMConfig(vmid),
			proxmoxService.getVMStatus(vmid),
			proxmoxService.getVMs(),
		]);
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		res.send(vmDetailView({ vmid, config: cfg, status, vm }));
	} catch (error) {
		console.error(`VM detail error (${vmid}):`, error.message);
		res
			.status(500)
			.send(`<div class="error">Failed to load VM ${vmid} details</div>`);
	}
});

/**
 * POST /vms/:vmid/start
 */
vmRouter.post("/vms/:vmid/start", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.startVM(vmid);
		await pollTask(result.task);
		await sleep(2000);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after start"));
		}
	} catch (error) {
		console.error(`VM start error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /vms/:vmid/stop
 */
vmRouter.post("/vms/:vmid/stop", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.stopVM(vmid);
		await pollTask(result.task);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after stop"));
		}
	} catch (error) {
		console.error(`VM stop error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /vms/:vmid/shutdown
 */
vmRouter.post("/vms/:vmid/shutdown", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.shutdownVM(vmid);
		await pollTask(result.task);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after shutdown"));
		}
	} catch (error) {
		console.error(`VM shutdown error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /vms/:vmid/reboot
 */
vmRouter.post("/vms/:vmid/reboot", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.rebootVM(vmid);
		await pollTask(result.task);
		await sleep(3000);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after reboot"));
		}
	} catch (error) {
		console.error(`VM reboot error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /vms/:vmid/suspend
 */
vmRouter.post("/vms/:vmid/suspend", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.suspendVM(vmid);
		await pollTask(result.task);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after suspend"));
		}
	} catch (error) {
		console.error(`VM suspend error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * POST /vms/:vmid/resume
 */
vmRouter.post("/vms/:vmid/resume", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.resumeVM(vmid);
		await pollTask(result.task);
		const vms = await proxmoxService.getVMs();
		const vm = vms.find((v) => v.vmid === Number.parseInt(vmid, 10));
		if (vm) {
			res.send(vmRow(vm));
		} else {
			res.send(errorRow(vmid, "VM not found after resume"));
		}
	} catch (error) {
		console.error(`VM resume error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * DELETE /vms/:vmid
 */
vmRouter.delete("/vms/:vmid", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const result = await proxmoxService.deleteVM(vmid);
		await pollTask(result.task);
		res.send("");
	} catch (error) {
		console.error(`VM delete error (${vmid}):`, error.message);
		res.send(errorRow(vmid, error.message));
	}
});

/**
 * GET /vms/:vmid/snapshots
 * Return snapshots panel for a VM
 */
vmRouter.get("/vms/:vmid/snapshots", async (req, res) => {
	const vmid = req.params.vmid;
	try {
		const snapshots = await proxmoxService.getVMSnapshots(vmid);
		res.send(vmSnapshotsView(vmid, snapshots));
	} catch (error) {
		console.error(`VM snapshots error (${vmid}):`, error.message);
		res
			.status(500)
			.send(`<div class="error">Failed to load snapshots</div>`);
	}
});

/**
 * POST /vms/:vmid/snapshots
 * Create a new snapshot
 */
vmRouter.post("/vms/:vmid/snapshots", async (req, res) => {
	const vmid = req.params.vmid;
	const { name, description } = req.body;
	try {
		if (!name) {
			res.status(400).send(`<div class="error">Snapshot name is required</div>`);
			return;
		}
		const result = await proxmoxService.createVMSnapshot(vmid, name, description || "");
		await pollTask(result.task);
		const snapshots = await proxmoxService.getVMSnapshots(vmid);
		res.send(vmSnapshotsView(vmid, snapshots));
	} catch (error) {
		console.error(`VM snapshot create error (${vmid}):`, error.message);
		res.send(`<div class="error">${error.message}</div>`);
	}
});

/**
 * DELETE /vms/:vmid/snapshots/:snapname
 */
vmRouter.delete("/vms/:vmid/snapshots/:snapname", async (req, res) => {
	const { vmid, snapname } = req.params;
	try {
		const result = await proxmoxService.deleteVMSnapshot(vmid, snapname);
		await pollTask(result.task);
		const snapshots = await proxmoxService.getVMSnapshots(vmid);
		res.send(vmSnapshotsView(vmid, snapshots));
	} catch (error) {
		console.error(`VM snapshot delete error:`, error.message);
		res.send(`<div class="error">${error.message}</div>`);
	}
});

/**
 * POST /vms/:vmid/snapshots/:snapname/rollback
 */
vmRouter.post("/vms/:vmid/snapshots/:snapname/rollback", async (req, res) => {
	const { vmid, snapname } = req.params;
	try {
		const result = await proxmoxService.rollbackVMSnapshot(vmid, snapname);
		await pollTask(result.task);
		const snapshots = await proxmoxService.getVMSnapshots(vmid);
		res.send(vmSnapshotsView(vmid, snapshots));
	} catch (error) {
		console.error(`VM snapshot rollback error:`, error.message);
		res.send(`<div class="error">${error.message}</div>`);
	}
});

// ─── Helpers ──────────────────────────────────────────────────────

async function pollTask(upid, maxAttempts = 30, interval = 500) {
	if (!upid) return;
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const status = await proxmoxService.getTaskStatus(upid);
			if (status === "stopped") return;
			await sleep(interval);
		} catch (_error) {
			await sleep(interval);
			return;
		}
	}
	console.warn(`Task ${upid} polling timeout, continuing anyway`);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
