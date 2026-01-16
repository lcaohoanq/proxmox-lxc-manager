mod proxmox;

use proxmox::{ProxmoxClient, Container};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

#[derive(Serialize)]
struct ProxmoxConfig {
    host: String,
    node: String,
}

// Global state for Proxmox client
struct AppState {
    proxmox: Mutex<Option<ProxmoxClient>>,
    config: ProxmoxConfig,
}

#[tauri::command]
fn get_config(state: State<'_, AppState>) -> ProxmoxConfig {
    ProxmoxConfig {
        host: state.config.host.clone(),
        node: state.config.node.clone(),
    }
}

#[tauri::command]
async fn get_containers(state: State<'_, AppState>) -> Result<Vec<Container>, String> {
    let client = {
        let guard = state.proxmox.lock().unwrap();
        guard.clone()
    };
    
    match client {
        Some(proxmox) => proxmox.get_containers().await,
        None => Err("Proxmox client not initialized".to_string()),
    }
}

#[tauri::command]
async fn start_container(vmid: u32, state: State<'_, AppState>) -> Result<String, String> {
    let client = {
        let guard = state.proxmox.lock().unwrap();
        guard.clone()
    };
    
    match client {
        Some(proxmox) => proxmox.start_container(vmid).await,
        None => Err("Proxmox client not initialized".to_string()),
    }
}

#[tauri::command]
async fn stop_container(vmid: u32, state: State<'_, AppState>) -> Result<String, String> {
    let client = {
        let guard = state.proxmox.lock().unwrap();
        guard.clone()
    };
    
    match client {
        Some(proxmox) => proxmox.stop_container(vmid).await,
        None => Err("Proxmox client not initialized".to_string()),
    }
}

#[tauri::command]
async fn delete_container(vmid: u32, state: State<'_, AppState>) -> Result<String, String> {
    let client = {
        let guard = state.proxmox.lock().unwrap();
        guard.clone()
    };
    
    match client {
        Some(proxmox) => proxmox.delete_container(vmid).await,
        None => Err("Proxmox client not initialized".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load config from environment
    dotenv::dotenv().ok();
    let host = std::env::var("PROXMOX_HOST").unwrap_or_else(|_| "unknown".to_string());
    let node = std::env::var("PROXMOX_NODE").unwrap_or_else(|_| "unknown".to_string());
    
    let config = ProxmoxConfig {
        host: host.clone(),
        node: node.clone(),
    };

    // Initialize Proxmox client
    let proxmox_client = match ProxmoxClient::new() {
        Ok(client) => {
            println!("✓ Proxmox client initialized");
            Some(client)
        }
        Err(e) => {
            eprintln!("✗ Failed to initialize Proxmox client: {}", e);
            eprintln!("  Make sure .env file exists with correct credentials");
            None
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            proxmox: Mutex::new(proxmox_client),
            config,
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_containers,
            start_container,
            stop_container,
            delete_container
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
