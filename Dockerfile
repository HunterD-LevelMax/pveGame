# Build stage
FROM node:18-alpine as build-stage

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# Production stage
FROM node:18-alpine as production-stage

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

COPY package*.json ./

RUN npm ci --only=production

COPY --from=build-stage /app/dist ./dist
COPY --from=build-stage /app/server.js ./

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]