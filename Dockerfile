FROM node:22-alpine

WORKDIR /app

COPY . .
COPY package.json ./
# COPY .env ./.env


RUN npm install

EXPOSE 8080
CMD ["npm", "run", "api:docker"]
