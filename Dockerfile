# =============================================================================
# Production Dockerfile for Google Cloud Run
# Uses multi-stage build with Node.js 24 slim for minimal image size
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:24-slim AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Using npm ci for deterministic builds from lock file
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM node:24-slim AS production

# Set environment variables
ENV NODE_ENV=production
# Cloud Run expects port 8080
ENV PORT=8040

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

# Copy application source
COPY package*.json ./
COPY src ./src

# Create non-root user for security
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port (Cloud Run uses 8080 by default)
EXPOSE 8040

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:8040/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Use dumb-init for proper signal handling
# Run node directly (faster startup than npm start)
CMD ["dumb-init", "node", "src/index.js"]
