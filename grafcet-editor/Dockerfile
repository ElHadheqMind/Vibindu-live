# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Accept build arguments for API URLs
ARG VITE_API_BASE_URL=http://localhost:3001/api
ARG VITE_AGENTS_BASE_URL=http://localhost:8080

# The VITE_* environment variables will be embedded in the build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_AGENTS_BASE_URL=$VITE_AGENTS_BASE_URL

# Copy package files (include lock file for reproducible builds)
COPY package.json package-lock.json ./

# Install dependencies using npm (matching lock file)
# --legacy-peer-deps needed because @react-spring/konva doesn't officially support React 19 yet
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
