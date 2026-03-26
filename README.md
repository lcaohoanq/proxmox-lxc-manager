# Proxmox Manager

A minimal, production-quality web UI for managing Proxmox LXC containers.

![plm](https://github.com/user-attachments/assets/c1225282-923c-49bc-bbde-bc9cc64f91c1)

Realtime sync with Proxmox server

![proxmox](https://github.com/user-attachments/assets/18e8b641-7424-4412-a56c-c05724b07c36)

- `promox-ui`: Nodejs, Pug
- `proxmox-ui-tauri`: Tauri, Typescript, Rust

## Prerequisites

- Proxmox VE server with API access (fill in `.env` file)

## How to use

- Export your token and place in `.env` file
```bash
cd proxmox_ui
cp .env.example .env
```

- After setting up, using `docker compose` command to start

```bash
docker compose up -d
```
