FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY . .
EXPOSE 7700 7701 7702
CMD ["node", "index.js"]
