use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone)]
pub struct ProxmoxClient {
    client: Client,
    host: String,
    node: String,
    token_id: String,
    token_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Container {
    pub vmid: u32,
    pub name: String,
    pub status: String,
    pub uptime: u64,
    pub memory: u64,
    pub max_memory: u64,
    pub cpu: f64,
    pub cpus: u32,
    pub disk_read: u64,
    pub disk_write: u64,
    pub ip_address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxContainer {
    vmid: u32,
    name: Option<String>,
    status: String,
    uptime: Option<u64>,
    mem: Option<u64>,
    maxmem: Option<u64>,
    cpu: Option<f64>,
    cpus: Option<u32>,
    diskread: Option<u64>,
    diskwrite: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct ProxmoxResponse<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
struct NetworkInterface {
    name: String,
    inet: Option<String>,
}

impl ProxmoxClient {
    pub fn new() -> Result<Self, String> {
        dotenv::dotenv().ok();
        
        let host = env::var("PROXMOX_HOST")
            .map_err(|_| "PROXMOX_HOST not set in .env file".to_string())?;
        let node = env::var("PROXMOX_NODE")
            .map_err(|_| "PROXMOX_NODE not set in .env file".to_string())?;
        let token_id = env::var("PROXMOX_TOKEN_ID")
            .map_err(|_| "PROXMOX_TOKEN_ID not set in .env file".to_string())?;
        let token_secret = env::var("PROXMOX_TOKEN_SECRET")
            .map_err(|_| "PROXMOX_TOKEN_SECRET not set in .env file".to_string())?;

        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(ProxmoxClient {
            client,
            host,
            node,
            token_id,
            token_secret,
        })
    }

    fn auth_header(&self) -> String {
        format!("PVEAPIToken={}={}", self.token_id, self.token_secret)
    }

    pub async fn get_containers(&self) -> Result<Vec<Container>, String> {
        let url = format!("https://{}/api2/json/nodes/{}/lxc", self.host, self.node);
        
        let response = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch containers: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let proxmox_response: ProxmoxResponse<Vec<ProxmoxContainer>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let mut containers = Vec::new();
        for ct in proxmox_response.data {
            let ip_address = if ct.status == "running" {
                self.get_container_ip(ct.vmid).await.ok()
            } else {
                None
            };

            containers.push(Container {
                vmid: ct.vmid,
                name: ct.name.unwrap_or_else(|| format!("CT-{}", ct.vmid)),
                status: ct.status,
                uptime: ct.uptime.unwrap_or(0),
                memory: ct.mem.unwrap_or(0),
                max_memory: ct.maxmem.unwrap_or(0),
                cpu: ct.cpu.unwrap_or(0.0),
                cpus: ct.cpus.unwrap_or(1),
                disk_read: ct.diskread.unwrap_or(0),
                disk_write: ct.diskwrite.unwrap_or(0),
                ip_address,
            });
        }

        containers.sort_by_key(|c| c.vmid);
        Ok(containers)
    }

    async fn get_container_ip(&self, vmid: u32) -> Result<String, String> {
        let url = format!(
            "https://{}/api2/json/nodes/{}/lxc/{}/interfaces",
            self.host, self.node, vmid
        );

        let response = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch IP: {}", e))?;

        if !response.status().is_success() {
            return Err("Failed to get IP".to_string());
        }

        let proxmox_response: ProxmoxResponse<Vec<NetworkInterface>> = response
            .json()
            .await
            .map_err(|_| "Failed to parse interfaces".to_string())?;

        for iface in proxmox_response.data {
            if iface.name != "lo" {
                if let Some(inet) = iface.inet {
                    let ip = inet.split('/').next().unwrap_or(&inet);
                    return Ok(ip.to_string());
                }
            }
        }

        Err("No IP found".to_string())
    }

    pub async fn start_container(&self, vmid: u32) -> Result<String, String> {
        let url = format!(
            "https://{}/api2/json/nodes/{}/lxc/{}/status/start",
            self.host, self.node, vmid
        );

        let response = self.client
            .post(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("Failed to start container: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to start container: {}", response.status()));
        }

        Ok(format!("Container {} started successfully", vmid))
    }

    pub async fn stop_container(&self, vmid: u32) -> Result<String, String> {
        let url = format!(
            "https://{}/api2/json/nodes/{}/lxc/{}/status/stop",
            self.host, self.node, vmid
        );

        let response = self.client
            .post(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("Failed to stop container: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to stop container: {}", response.status()));
        }

        Ok(format!("Container {} stopped successfully", vmid))
    }

    pub async fn delete_container(&self, vmid: u32) -> Result<String, String> {
        let url = format!(
            "https://{}/api2/json/nodes/{}/lxc/{}",
            self.host, self.node, vmid
        );

        let response = self.client
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("Failed to delete container: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to delete container: {}", response.status()));
        }

        Ok(format!("Container {} deleted successfully", vmid))
    }
}
