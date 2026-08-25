# صورة خفيفة لتشغيل سنونو على Railway (HTTP فقط، بدون متصفح)
FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "src/index.js"]
