import proxmoxApi from "proxmox-api";
import { config } from "../config.js";

/**
 * Proxmox API Service
 *
 * Handles all interactions with Proxmox VE API
 * Wraps proxmox-api client with error handling and convenience methods
 */
class ProxmoxService {
	constructor() {
		this.client = null;
		this.connected = false;
	}

	/**
	 * Initialize Proxmox API connection
	 * Uses API token authentication (secure, no password needed)
	 */
	async connect() {
		if (this.connected) return;

		// Accept self-signed certificates (standard for Proxmox)
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

		try {
			this.client = proxmoxApi({
				host: config.proxmox.host,
				tokenID: config.proxmox.tokenId,
				tokenSecret: config.proxmox.tokenSecret,
			});

			// Verify connection with a simple API call
			await this.client.nodes.$get();
			this.connected = true;
			console.log(`Connected to Proxmox: ${config.proxmox.host}`);
		} catch (error) {
			console.error("Failed to connect to Proxmox:", error.message);
			throw new Error("Proxmox connection failed. Check your credentials.");
		}
	}

	/**
	 * Get all LXC containers on the configured node
	 * Returns clean data structure for UI consumption
	 */
	async getContainers() {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const containers = await this.client.nodes.$(node).lxc.$get();

			// Transform Proxmox API response and fetch IPs for running containers
			const containersWithDetails = await Promise.all(
				containers.map(async (ct) => {
					let ipAddress = null;

					// Fetch IP address if container is running
					if (ct.status === "running") {
						try {
							const interfaces = await this.client.nodes
								.$(node)
								.lxc.$(ct.vmid)
								.interfaces.$get();
							// Get first non-loopback IPv4 address
							for (const iface of interfaces) {
								if (iface.name !== "lo" && iface["inet"]) {
									ipAddress = iface["inet"].replace(/\/\d+$/, ""); // Remove CIDR suffix
									break;
								}
							}
						} catch (_error) {
							// If can't fetch IP, just continue without it
							console.warn(`Could not fetch IP for container ${ct.vmid}`);
						}
					}

					return {
						vmid: ct.vmid,
						name: ct.name || `CT-${ct.vmid}`,
						status: ct.status,
						uptime: ct.uptime || 0,
						memory: ct.mem || 0,
						maxDisk: ct.maxdisk || 0,
						maxMemory: ct.maxmem || 0,
						maxSwap: ct.maxswap || 0,
						cpu: ct.cpu || 0,
						cpus: ct.cpus || 1,
						diskRead: ct.diskread || 0,
						diskWrite: ct.diskwrite || 0,
						ipAddress: ipAddress,
					};
				}),
			);

			return containersWithDetails.sort((a, b) => a.vmid - b.vmid);
		} catch (error) {
			console.error("Failed to fetch containers:", error.message);
			throw new Error("Failed to fetch containers from Proxmox");
		}
	}

	/**
	 * Start an LXC container
	 */
	async startContainer(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.lxc.$(vmid)
				.status.start.$post();

			// Proxmox returns a UPID (task ID) for async operations
			// In production, you might want to poll the task status
			console.log(`Started container ${vmid}, task: ${result}`);

			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to start container ${vmid}:`, error.message);
			throw new Error(`Failed to start container ${vmid}`);
		}
	}

	/**
	 * Stop an LXC container
	 */
	async stopContainer(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.lxc.$(vmid)
				.status.stop.$post();

			console.log(`Stopped container ${vmid}, task: ${result}`);

			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to stop container ${vmid}:`, error.message);
			throw new Error(`Failed to stop container ${vmid}`);
		}
	}

	/**
	 * Delete an LXC container
	 * This is destructive and cannot be undone
	 */
	async deleteContainer(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes.$(node).lxc.$(vmid).$delete();

			console.log(`Deleted container ${vmid}, task: ${result}`);

			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to delete container ${vmid}:`, error.message);
			throw new Error(`Failed to delete container ${vmid}`);
		}
	}

	/**
	 * Get task status by UPID
	 * Returns task status: running, stopped, etc.
	 */
	async getTaskStatus(upid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const status = await this.client.nodes
				.$(node)
				.tasks.$(upid)
				.status.$get();
			return status.status;
		} catch (error) {
			console.error(`Failed to get task status ${upid}:`, error.message);
			throw error;
		}
	}

	/**
	 * Get host node status information
	 * Returns CPU, memory, disk, swap, kernel info, etc.
	 */
	async getHostStatus() {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const status = await this.client.nodes.$(node).status.$get();
			const version = await this.client.nodes.$(node).version.$get();

			return {
				cpu: {
					usage: ((status.cpu || 0) * 100).toFixed(2),
					cores: status.cpuinfo?.cpus || 0,
					model: status.cpuinfo?.model || "N/A",
					sockets: status.cpuinfo?.sockets || 0,
				},
				memory: {
					used: status.memory?.used || 0,
					total: status.memory?.total || 0,
					usedGB: ((status.memory?.used || 0) / 1024 ** 3).toFixed(2),
					totalGB: ((status.memory?.total || 0) / 1024 ** 3).toFixed(2),
					percentage: (
						((status.memory?.used || 0) / (status.memory?.total || 1)) *
						100
					).toFixed(2),
				},
				swap: {
					used: status.swap?.used || 0,
					total: status.swap?.total || 0,
					usedGB: ((status.swap?.used || 0) / 1024 ** 3).toFixed(2),
					totalGB: ((status.swap?.total || 0) / 1024 ** 3).toFixed(2),
					percentage:
						status.swap?.total > 0
							? (((status.swap?.used || 0) / status.swap.total) * 100).toFixed(
									2,
								)
							: "0.00",
				},
				disk: {
					used: status.rootfs?.used || 0,
					total: status.rootfs?.total || 0,
					usedGB: ((status.rootfs?.used || 0) / 1024 ** 3).toFixed(2),
					totalGB: ((status.rootfs?.total || 0) / 1024 ** 3).toFixed(2),
					percentage: (
						((status.rootfs?.used || 0) / (status.rootfs?.total || 1)) *
						100
					).toFixed(2),
				},
				load: [
					Number.parseFloat(status.loadavg?.[0] || 0),
					Number.parseFloat(status.loadavg?.[1] || 0),
					Number.parseFloat(status.loadavg?.[2] || 0),
				],
				ioDelay: ((status.wait || 0) * 100).toFixed(2),
				uptime: status.uptime || 0,
				ksmSharing: status.ksm?.shared || 0,
				kernel: status.kversion || "N/A",
				bootMode: status.boot_info?.mode || "N/A",
				pveVersion: version.version || "N/A",
			};
		} catch (error) {
			console.error("Failed to fetch host status:", error.message);
			throw new Error("Failed to fetch host status from Proxmox");
		}
	}

	// ─── VM (QEMU) Methods ───────────────────────────────────────────

	/**
	 * Get all QEMU VMs on the configured node
	 */
	async getVMs() {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const vms = await this.client.nodes.$(node).qemu.$get();

			const vmsWithDetails = await Promise.all(
				vms.map(async (vm) => {
					let ipAddress = null;

					if (vm.status === "running") {
						try {
							const agentNet = await this.client.nodes
								.$(node)
								.qemu.$(vm.vmid)
								["agent"]["network-get-interfaces"].$get();
							for (const iface of agentNet.result || []) {
								if (iface.name === "lo") continue;
								const v4 = (iface["ip-addresses"] || []).find(
									(a) => a["ip-address-type"] === "ipv4",
								);
								if (v4) {
									ipAddress = v4["ip-address"];
									break;
								}
							}
						} catch (_e) {
							// guest agent may not be installed
						}
					}

					return {
						vmid: vm.vmid,
						name: vm.name || `VM-${vm.vmid}`,
						status: vm.status,
						uptime: vm.uptime || 0,
						memory: vm.mem || 0,
						maxMemory: vm.maxmem || 0,
						cpu: vm.cpu || 0,
						cpus: vm.cpus || 1,
						maxDisk: vm.maxdisk || 0,
						diskRead: vm.diskread || 0,
						diskWrite: vm.diskwrite || 0,
						netin: vm.netin || 0,
						netout: vm.netout || 0,
						pid: vm.pid || null,
						ipAddress,
					};
				}),
			);

			return vmsWithDetails.sort((a, b) => a.vmid - b.vmid);
		} catch (error) {
			console.error("Failed to fetch VMs:", error.message);
			throw new Error("Failed to fetch VMs from Proxmox");
		}
	}

	/**
	 * Get detailed config for a single VM
	 */
	async getVMConfig(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const cfg = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.config.$get();
			return cfg;
		} catch (error) {
			console.error(`Failed to get VM config ${vmid}:`, error.message);
			throw new Error(`Failed to get VM ${vmid} config`);
		}
	}

	/**
	 * Get VM status (current runtime info)
	 */
	async getVMStatus(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const status = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.current.$get();
			return status;
		} catch (error) {
			console.error(`Failed to get VM status ${vmid}:`, error.message);
			throw new Error(`Failed to get VM ${vmid} status`);
		}
	}

	/**
	 * Start a QEMU VM
	 */
	async startVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.start.$post();
			console.log(`Started VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to start VM ${vmid}:`, error.message);
			throw new Error(`Failed to start VM ${vmid}`);
		}
	}

	/**
	 * Stop a QEMU VM (graceful ACPI shutdown)
	 */
	async stopVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.stop.$post();
			console.log(`Stopped VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to stop VM ${vmid}:`, error.message);
			throw new Error(`Failed to stop VM ${vmid}`);
		}
	}

	/**
	 * Shutdown a QEMU VM (ACPI shutdown request)
	 */
	async shutdownVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.shutdown.$post();
			console.log(`Shutdown VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to shutdown VM ${vmid}:`, error.message);
			throw new Error(`Failed to shutdown VM ${vmid}`);
		}
	}

	/**
	 * Reboot a QEMU VM
	 */
	async rebootVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.reboot.$post();
			console.log(`Rebooted VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to reboot VM ${vmid}:`, error.message);
			throw new Error(`Failed to reboot VM ${vmid}`);
		}
	}

	/**
	 * Suspend (pause) a QEMU VM
	 */
	async suspendVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.suspend.$post();
			console.log(`Suspended VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to suspend VM ${vmid}:`, error.message);
			throw new Error(`Failed to suspend VM ${vmid}`);
		}
	}

	/**
	 * Resume a suspended QEMU VM
	 */
	async resumeVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.status.resume.$post();
			console.log(`Resumed VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to resume VM ${vmid}:`, error.message);
			throw new Error(`Failed to resume VM ${vmid}`);
		}
	}

	/**
	 * Delete a QEMU VM
	 */
	async deleteVM(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes.$(node).qemu.$(vmid).$delete();
			console.log(`Deleted VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to delete VM ${vmid}:`, error.message);
			throw new Error(`Failed to delete VM ${vmid}`);
		}
	}

	/**
	 * Get VM snapshots
	 */
	async getVMSnapshots(vmid) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const snapshots = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.snapshot.$get();
			return snapshots.filter((s) => s.name !== "current");
		} catch (error) {
			console.error(`Failed to get VM snapshots ${vmid}:`, error.message);
			throw new Error(`Failed to get VM ${vmid} snapshots`);
		}
	}

	/**
	 * Create a VM snapshot
	 */
	async createVMSnapshot(vmid, name, description = "") {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.snapshot.$post({ snapname: name, description });
			console.log(`Created snapshot '${name}' for VM ${vmid}, task: ${result}`);
			return { success: true, task: result };
		} catch (error) {
			console.error(`Failed to create snapshot for VM ${vmid}:`, error.message);
			throw new Error(`Failed to create snapshot for VM ${vmid}`);
		}
	}

	/**
	 * Delete a VM snapshot
	 */
	async deleteVMSnapshot(vmid, snapname) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.snapshot.$(snapname)
				.$delete();
			console.log(
				`Deleted snapshot '${snapname}' from VM ${vmid}, task: ${result}`,
			);
			return { success: true, task: result };
		} catch (error) {
			console.error(
				`Failed to delete snapshot ${snapname} for VM ${vmid}:`,
				error.message,
			);
			throw new Error(`Failed to delete snapshot`);
		}
	}

	/**
	 * Rollback VM to a snapshot
	 */
	async rollbackVMSnapshot(vmid, snapname) {
		await this.ensureConnected();

		try {
			const node = config.proxmox.node;
			const result = await this.client.nodes
				.$(node)
				.qemu.$(vmid)
				.snapshot.$(snapname)
				.rollback.$post();
			console.log(
				`Rolled back VM ${vmid} to snapshot '${snapname}', task: ${result}`,
			);
			return { success: true, task: result };
		} catch (error) {
			console.error(
				`Failed to rollback VM ${vmid} to ${snapname}:`,
				error.message,
			);
			throw new Error(`Failed to rollback to snapshot`);
		}
	}

	/**
	 * Ensure we're connected before making API calls
	 */
	async ensureConnected() {
		if (!this.connected) {
			await this.connect();
		}
	}
}

// Export singleton instance
export const proxmoxService = new ProxmoxService();
