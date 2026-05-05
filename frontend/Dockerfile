# frontend/Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and lock file first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies cleanly
RUN npm ci

# Copy the rest of the frontend code
COPY . .

# Accept the API URL as a build argument so Next.js can bake it into the HTML
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Build the Next.js application for production
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Start the Next.js production server
CMD ["npm", "start"]