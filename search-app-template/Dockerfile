FROM node:22-alpine

WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
COPY config ./config

EXPOSE 3000
CMD ["node", "server.mjs"]
