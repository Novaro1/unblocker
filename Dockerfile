FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# HuggingFace Spaces expects 7860 by default.
# Google Cloud Run automatically overrides PORT with 8080 at runtime.
EXPOSE 7860
ENV PORT=7860

CMD ["node", "src/index.js"]
