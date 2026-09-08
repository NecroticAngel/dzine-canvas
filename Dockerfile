FROM node:26.8.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:26.8.1-alpine
ENV NODE_ENV=production \
    PORT=4201 \
    TEMPLATES_DIR=/data/templates
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force
COPY api ./api
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4201
CMD ["node", "api/server.js"]
