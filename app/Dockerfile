FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app ./
COPY shared /shared
COPY scripts /scripts
ENV EXPO_PUBLIC_API_URL=/api
RUN npm run typecheck && npm run build

FROM nginx:1.27-alpine
COPY app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
