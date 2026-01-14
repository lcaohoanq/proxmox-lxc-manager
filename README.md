# Proxmox LXC Manager

A minimal, production-quality web UI for managing Proxmox LXC containers.

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
