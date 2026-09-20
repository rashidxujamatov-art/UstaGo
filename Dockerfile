# Production Multi-Stage Dockerfile for UstaGo Platform
FROM node:20-alpine AS base

WORKDIR /app

# Copy package descriptors
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy Application Source Code
COPY . .

# Expose HTTP Port
EXPOSE 4000
EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=4000

# Start Production Backend Server
CMD ["node", "backend/server.js"]
