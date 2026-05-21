# 文献综述助手 - 全栈部署 Dockerfile
# 支持 Node.js 后端 + 前端静态文件

FROM node:20-slim

WORKDIR /app

# 复制 package 文件并安装依赖
COPY package.json package-lock.json ./
RUN npm install --production

# 复制构建产物
COPY dist/ ./dist/

# 暴露端口
EXPOSE 3000

# 启动后端服务器（同时提供 API + 前端静态文件）
CMD ["node", "dist/boot.js"]
