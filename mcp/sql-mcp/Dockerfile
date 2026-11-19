# The Server's container image: the one-file bundle `npm run build:image` makes, and Node to run it.
# Build the bundle first: npm run build:image && docker build -t sql-mcp:local .
FROM node:24-slim
WORKDIR /app
COPY dist/server.js dist/server.js
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "dist/server.js"]
