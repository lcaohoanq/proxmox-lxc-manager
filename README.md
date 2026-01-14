# Proxmox LXC Manager

A minimal, production-quality web UI for managing Proxmox LXC containers.

![plm](https://github.com/user-attachments/assets/c1225282-923c-49bc-bbde-bc9cc64f91c1)

Realtime sync with Proxmox server

![proxmox](https://github.com/user-attachments/assets/18e8b641-7424-4412-a56c-c05724b07c36)

## Prerequisites

- Proxmox VE server with API access (fill in `.env` file)

## How to run

Development:

```zsh
bun install
bun run dev
```

Docker compose:

```zsh
docker-compose up -d
```

- Then access the app at `http://localhost:3000`
