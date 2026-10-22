FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV HOST=0.0.0.0 PORT=4747 IMESSAGE=0
EXPOSE 4747
CMD ["npx", "tsx", "src/index.ts"]
