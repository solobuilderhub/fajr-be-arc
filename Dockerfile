# =============================================================================
# Production Dockerfile for Google Cloud Run
# Uses multi-stage build with Node.js 24 slim for minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:24-slim AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to dist/
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production Dependencies
# -----------------------------------------------------------------------------
FROM node:24-slim AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 3: Production
# -----------------------------------------------------------------------------
FROM node:24-slim AS production

# Set environment variables
ENV NODE_ENV=production
# Cloud Run expects port 8080
ENV PORT=8080

# Install only runtime dependencies needed for sharp (image processing)
# dumb-init for proper signal handling in containers
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        dumb-init \
        libvips42 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY package.json ./
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port (Cloud Run uses 8080)
EXPOSE 8080

# Use dumb-init for proper signal handling
# Run node directly (faster startup than npm start)
CMD ["dumb-init", "node", "dist/index.js"]
