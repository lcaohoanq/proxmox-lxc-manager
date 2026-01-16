import { invoke } from "@tauri-apps/api/core";

interface Container {
  vmid: number;
  name: string;
  status: string;
  uptime: number;
  memory: number;
  max_memory: number;
  cpu: number;
  cpus: number;
  disk_read: number;
  disk_write: number;
  ip_address: string | null;
}

interface ProxmoxConfig {
  host: string;
  node: string;
}

let autoRefreshInterval: number | null = null;
let config: ProxmoxConfig | null = null;

// Format bytes to human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format uptime seconds to HH:MM:SS
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Show error message
function showError(message: string) {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const errorTextEl = document.getElementById("error-text");
  const containerListEl = document.getElementById("container-list");

  if (loadingEl) loadingEl.style.display = "none";
  if (containerListEl) containerListEl.innerHTML = "";
  if (errorEl) errorEl.style.display = "block";
  if (errorTextEl) errorTextEl.textContent = message;
}

// Hide error message
function hideError() {
  const errorEl = document.getElementById("error");
  if (errorEl) errorEl.style.display = "none";
}

// Render container row
function renderContainerRow(container: Container): string {
  const statusClass = container.status === "running" ? "status-running" : "status-stopped";
  const memoryPercent = container.max_memory > 0 
    ? (container.memory / container.max_memory * 100).toFixed(1) 
    : 0;
  const cpuPercent = (container.cpu * 100).toFixed(1);
  const uptime = formatUptime(container.uptime);

  const actionButtons = container.status === "running"
    ? `<button onclick="stopContainer(${container.vmid})" class="btn-secondary">Stop</button>`
    : `<button onclick="startContainer(${container.vmid})" class="btn-primary">Start</button>`;

  return `
    <tr id="row-${container.vmid}">
      <td><strong>${container.vmid}</strong></td>
      <td>${container.name}</td>
      <td><span class="status ${statusClass}">${container.status}</span></td>
      <td>${container.ip_address || "-"}</td>
      <td>
        <div class="metric">${formatBytes(container.memory)} / ${formatBytes(container.max_memory)}</div>
        <div class="memory-bar">
          <div class="memory-fill" style="width: ${memoryPercent}%"></div>
        </div>
      </td>
      <td><span class="metric">${cpuPercent}% (${container.cpus} cores)</span></td>
      <td>${uptime}</td>
      <td class="actions">
        ${actionButtons}
        <button onclick="deleteContainer(${container.vmid}, '${container.name}')" class="btn-danger">Delete</button>
      </td>
    </tr>
  `;
}

// Load and display containers
async function loadContainers() {
  try {
    hideError();
    const containers = await invoke<Container[]>("get_containers");
    
    const loadingEl = document.getElementById("loading");
    const containerListEl = document.getElementById("container-list");
    
    if (loadingEl) loadingEl.style.display = "none";
    
    if (containers.length === 0) {
      if (containerListEl) {
        containerListEl.innerHTML = `
          <div class="empty-state">
            <h2>No containers found</h2>
            <p>No LXC containers are available on this Proxmox node.</p>
          </div>
        `;
      }
      return;
    }

    const tableHtml = `
      <table>
        <thead>
          <tr>
            <th>VMID</th>
            <th>Name</th>
            <th>Status</th>
            <th>IP Address</th>
            <th>Memory</th>
            <th>CPU</th>
            <th>Uptime</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${containers.map(renderContainerRow).join("")}
        </tbody>
      </table>
    `;

    if (containerListEl) {
      containerListEl.innerHTML = tableHtml;
    }
  } catch (error) {
    console.error("Failed to load containers:", error);
    showError(`Failed to load containers: ${error}`);
  }
}

// Start container
async function startContainer(vmid: number) {
  const button = document.querySelector(`#row-${vmid} .btn-primary`) as HTMLButtonElement;
  if (button) {
    button.disabled = true;
    button.textContent = "Starting...";
  }

  try {
    await invoke("start_container", { vmid });
    // Wait a bit for container to start and get IP
    await new Promise(resolve => setTimeout(resolve, 2000));
    await loadContainers();
  } catch (error) {
    console.error("Failed to start container:", error);
    alert(`Failed to start container: ${error}`);
    if (button) {
      button.disabled = false;
      button.textContent = "Start";
    }
  }
}

// Stop container
async function stopContainer(vmid: number) {
  const button = document.querySelector(`#row-${vmid} .btn-secondary`) as HTMLButtonElement;
  if (button) {
    button.disabled = true;
    button.textContent = "Stopping...";
  }

  try {
    await invoke("stop_container", { vmid });
    await loadContainers();
  } catch (error) {
    console.error("Failed to stop container:", error);
    alert(`Failed to stop container: ${error}`);
    if (button) {
      button.disabled = false;
      button.textContent = "Stop";
    }
  }
}

// Delete container
async function deleteContainer(vmid: number, name: string) {
  const confirmed = confirm(
    `Are you sure you want to DELETE container ${name} (${vmid})? This cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await invoke("delete_container", { vmid });
    await loadContainers();
  } catch (error) {
    console.error("Failed to delete container:", error);
    alert(`Failed to delete container: ${error}`);
  }
}

// Load Proxmox configuration
async function loadConfig() {
  try {
    config = await invoke<ProxmoxConfig>("get_config");
    
    // Update config info in header
    const configInfoEl = document.getElementById("config-info");
    if (configInfoEl && config) {
      configInfoEl.innerHTML = `
        <div>
        <div class="info-item">
          <span class="info-label">Host:</span>
          <span class="info-value">${config.host}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Node:</span>
          <span class="info-value">${config.node}</span>
        </div>
        </div>
      `;
    }
    
    // Update Proxmox UI link
    const proxmoxLink = document.getElementById("proxmox-link") as HTMLAnchorElement;
    if (proxmoxLink && config && config.host !== "unknown") {
      proxmoxLink.href = `https://${config.host}`;
      proxmoxLink.style.display = "inline-block";
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById("search-input") as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
      const rows = document.querySelectorAll("#container-list tbody tr");
      
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (cells.length === 0) return;
        
        const vmid = cells[0]?.textContent?.toLowerCase() || "";
        const name = cells[1]?.textContent?.toLowerCase() || "";
        const ip = cells[3]?.textContent?.toLowerCase() || "";
        
        const matches = vmid.includes(query) || name.includes(query) || ip.includes(query);
        (row as HTMLElement).style.display = matches ? "" : "none";
      });
    });
  }
}

// Make functions globally available
(window as any).startContainer = startContainer;
(window as any).stopContainer = stopContainer;
(window as any).deleteContainer = deleteContainer;

// Initialize app
window.addEventListener("DOMContentLoaded", async () => {
  await loadConfig();
  await loadContainers();
  setupSearch();
  
  // Auto-refresh every 15 seconds
  autoRefreshInterval = window.setInterval(loadContainers, 15000);
});

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
});
