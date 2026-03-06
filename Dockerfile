# Build gogcli
FROM golang:1.25-alpine AS gog-builder
RUN apk add --no-cache git make bash
RUN git clone https://github.com/steipete/gogcli.git /go/src/gogcli
WORKDIR /go/src/gogcli
RUN make build && cp bin/gog /usr/local/bin/gog

# Main bot image
FROM node:22-alpine
WORKDIR /app

# Copy gog binary from builder
COPY --from=gog-builder /usr/local/bin/gog /usr/local/bin/gog

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

CMD ["npm", "start"]
