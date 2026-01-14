# Stage 1: Builder - Cài đặt dependencies
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
# Lưu ý: Copy cả bun.lockb (ưu tiên) hoặc package-lock.json (nếu chưa có lockb)
COPY package.json bun.lockb* package-lock.json* ./

# Install dependencies
# --frozen-lockfile: Tương đương npm ci, đảm bảo cài đúng version trong lock file
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src

# Stage 2: Runner - Chạy ứng dụng
FROM oven/bun:1-alpine

WORKDIR /app

# Copy node_modules và source từ builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json ./

# Thiết lập biến môi trường
ENV NODE_ENV=production
ENV PORT=3000

# Image oven/bun tạo sẵn user tên là "bun" (UID 1000)
USER bun

EXPOSE 3000

# Dùng "bun run" thay vì "node"
CMD ["bun", "run", "src/server.js"]