# 文献综述助手 - 部署指南

## 概述

本文档指导如何将全栈版文献综述助手部署到支持 Node.js 后端运行的平台。

**部署要求**：
- Node.js 20+
- 1GB RAM（最低）
- 可访问互联网（调用 PubMed + DeepSeek API）

---

## 方法 1：Railway（推荐，最简单）

Railway 提供免费的 $5/月额度，足够运行此应用。

### 步骤

1. **注册 Railway**：[https://railway.app](https://railway.app)

2. **新建项目** → Deploy from GitHub repo

3. **设置环境变量**（Project Settings → Variables）：
   ```
   DATABASE_URL=你的MySQL数据库URL
   DEEPSEEK_API_KEY=sk-9e8a023f30cb4f68a05f33a9f678667c
   ```

4. **部署**：Railway 自动识别 Dockerfile 并构建

5. **访问**：部署完成后 Railway 提供域名，直接访问

---

## 方法 2：Render

Render 提供免费 tier（会休眠，但免费）。

### 步骤

1. **注册 Render**：[https://render.com](https://render.com)

2. **New Web Service** → Build and deploy from a Git repository

3. **配置**：
   - Build Command: `npm install && npm run build`
   - Start Command: `node dist/boot.js`
   - Plan: Free

4. **环境变量**（Environment → Add Environment Variable）：
   ```
   DATABASE_URL=你的MySQL数据库URL
   DEEPSEEK_API_KEY=sk-9e8a023f30cb4f68a05f33a9f678667c
   ```

5. **部署**：自动构建和部署

---

## 方法 3：VPS（如阿里云/腾讯云/AWS）

### 步骤

1. **购买 VPS**：最小配置 1核1G 即可

2. **安装 Node.js 20**：
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **上传项目文件**：
   ```bash
   # 本地上传
   scp -r dist/ root@你的服务器IP:/opt/literature-review/
   scp package.json root@你的服务器IP:/opt/literature-review/
   ```

4. **服务器上启动**：
   ```bash
   ssh root@你的服务器IP
   cd /opt/literature-review/
   npm install --production
   echo "DATABASE_URL=你的MySQL数据库URL" > .env
   echo "DEEPSEEK_API_KEY=sk-9e8a023f30cb4f68a05f33a9f678667c" >> .env
   node dist/boot.js
   ```

5. **使用 PM2 守护进程**（推荐）：
   ```bash
   npm install -g pm2
   pm2 start dist/boot.js --name literature-review
   pm2 startup
   pm2 save
   ```

6. **配置 Nginx 反向代理**（可选）：
   ```nginx
   server {
       listen 80;
       server_name 你的域名;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
       }
   }
   ```

---

## 方法 4：Docker 部署

### 构建镜像

```bash
cd 项目目录
docker build -t literature-review .
```

### 运行容器

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=你的MySQL数据库URL \
  -e DEEPSEEK_API_KEY=sk-9e8a023f30cb4f68a05f33a9f678667c \
  --name literature-review \
  literature-review
```

---

## 数据库

当前使用 MySQL（由 init.sh 自动配置）。如果需要更换：

- **开发测试**：可使用 SQLite（需修改 drizzle 配置）
- **生产环境**：推荐使用 PlanetScale（免费额度够用）或 Railway 自带的 MySQL

---

## 验证部署

部署成功后，访问以下地址验证：

```
# 测试 API
GET https://你的域名/api/trpc/ping

# 测试 PubMed 检索
POST https://你的域名/api/trpc/pubmed.search
Body: {"json": {"topic": "COVID-19 vaccine"}}

# 前端页面
https://你的域名/
```

---

## 项目文件结构

```
dist/
  boot.js          # 后端服务器入口（Node.js Hono 服务器）
  public/
    index.html     # 前端页面入口
    assets/        # 前端 JS/CSS 资源
```

**启动命令**：
```bash
node dist/boot.js
```

服务器在 3000 端口运行，同时提供：
- API 服务：`/api/trpc/*`（tRPC 接口）
- 静态文件：前端页面和资源文件
