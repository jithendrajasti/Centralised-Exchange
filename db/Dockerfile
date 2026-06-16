# DB seed/migration runner
FROM node:18-alpine
WORKDIR /app

COPY db/package.json db/package-lock.json ./
RUN npm install

COPY db/tsconfig.json ./
COPY db/src ./src
RUN npm run build

CMD ["node", "dist/seed-db.js"]
