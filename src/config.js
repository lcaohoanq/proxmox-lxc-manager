import dotenv from "dotenv";

dotenv.config();

export const config = {
	proxmox: {
		host: process.env.PROXMOX_HOST,
		node: process.env.PROXMOX_NODE,
		tokenId: process.env.PROXMOX_TOKEN_ID,
		tokenSecret: process.env.PROXMOX_TOKEN_SECRET,
	},
	server: {
		port: process.env.PORT || 3000,
		env: process.env.NODE_ENV || "development",
	},
};

export function validateConfig() {
	const required = [
		"PROXMOX_HOST",
		"PROXMOX_NODE",
		"PROXMOX_TOKEN_ID",
		"PROXMOX_TOKEN_SECRET",
	];

	const missing = required.filter((key) => !process.env[key]);

	if (missing.length > 0) {
		console.error("❌ Missing required environment variables:");
		missing.forEach((key) => {
			console.error(`   - ${key}`);
		});
		console.error(
			"\nCopy .env.example to .env and configure your Proxmox credentials.",
		);
		process.exit(1);
	}
}
