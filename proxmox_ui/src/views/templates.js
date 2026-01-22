import pug from "pug";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatesDir = join(__dirname, "templates");

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Dashboard page with container list
 */
export function dashboardPage(containers) {
	const template = pug.compileFile(join(templatesDir, "dashboard.pug"));
	return template({
		title: "Dashboard",
		containers,
		formatBytes,
		proxmoxHost: config.proxmox.host,
		proxmoxNode: config.proxmox.node,
	});
}

/**
 * Host information view (for htmx tab switching)
 */
export function hostInfoView(hostInfo) {
	const template = pug.compileFile(join(templatesDir, "host-info.pug"));
	return template({
		hostInfo,
	});
}

/**
 * Containers table view (for htmx tab switching)
 */
export function containersTableView(containers) {
	const templatePath = join(templatesDir, "containers-table.pug");
	try {
		const template = pug.compileFile(templatePath);
		const result = template({
			containers,
			formatBytes,
		});
		return result;
	} catch (error) {
		console.error("[ERROR] Stack:", error.stack);
		throw error;
	}
}

/**
 * Single container row (used for htmx swaps)
 */
export function containerRow(container) {
	const template = pug.compileFile(join(templatesDir, "container-row.pug"));
	return template({
		container,
		formatBytes,
	});
}

/**
 * Error message partial (for htmx error responses)
 */
export function errorRow(vmid, message) {
	const template = pug.compileFile(join(templatesDir, "error-row.pug"));
	return template({ vmid, message });
}

/**
 * 404 Error page
 */
export function notFoundPage() {
	const template = pug.compileFile(join(templatesDir, "not-found.pug"));
	return template({});
}

/**
 * 500 Error page
 */
export function errorPage() {
	const template = pug.compileFile(join(templatesDir, "error-page.pug"));
	return template({});
}
