# Railway 部署指南 - 文献综述助手

## 概述

Railway 提供每月 $5 免费额度，完全足够运行此应用。支持自动扩缩容、自带 MySQL 数据库、自动 HTTPS。

---

## 部署步骤

### 第 1 步：准备代码

1. 在 GitHub 上创建一个新仓库（如 `literature-review`）
2. 将本项目代码推送到该仓库：

```bash
# 在项目目录下执行
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/literature-review.git
git push -u origin main
```

### 第 2 步：创建 Railway 项目

1. 访问 [https://railway.app](https://railway.app) 并注册/登录
2. 点击 **"New Project"**
3. 选择 **"Deploy from GitHub repo"**
4. 选择你刚才创建的 `literature-review` 仓库
5. 点击 **"Deploy"**

### 第 3 步：添加 MySQL 数据库

1. 在项目页面点击 **"New"** → **"Database"** → **"Add MySQL"**
2. Railway 会自动创建一个 MySQL 实例
3. 点击 **"Connect"** 按钮，确保数据库与应用服务关联
4. Railway 会自动将 `DATABASE_URL` 环境变量注入到你的服务中

### 第 4 步：设置环境变量

1. 点击你的应用服务 → **"Variables"** 标签
2. 添加以下环境变量：

```
DEEPSEEK_API_KEY = sk-9e8a023f30cb4f68a05f33a9f678667c
```

3. `DATABASE_URL` 已由 Railway 自动设置，无需手动添加

### 第 5 步：重新部署

1. 添加数据库和环境变量后，Railway 会自动重新部署
2. 等待部署完成（约 2-3 分钟）
3. 部署成功后，Railway 会提供一个域名（如 `https://literature-review-production.up.railway.app`）

### 第 6 步：验证部署

访问提供的域名，测试以下功能：

1. **首页加载** - 应正常显示文献综述助手界面
2. **PubMed 检索** - 输入 "COVID-19 vaccine" 应返回文献列表
3. **综述生成** - 选择文献后生成综述，应显示 "DeepSeek AI" 标签（表示后端 AI 在工作）

---

## 项目配置说明

### railway.json（Railway 部署配置）

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npm run build && npm run db:generate"
  },
  "deploy": {
    "startCommand": "npm run db:migrate && npm start",
    "healthcheckPath": "/api/trpc/ping",
    "healthcheckTimeout": 30
  }
}
```

- **构建阶段**：安装依赖 + 构建前端/后端 + 生成数据库迁移文件
- **部署阶段**：执行数据库迁移 + 启动 Node.js 服务器
- **健康检查**：访问 `/api/trpc/ping` 确认服务正常

### 目录结构

```
.
├── api/               # 后端 API 代码
│   ├── boot.ts        # 服务器入口
│   ├── router.ts      # tRPC 路由
│   ├── routers/       # 业务路由
│   │   ├── pubmed.ts  # PubMed 检索
│   │   └── review.ts  # AI 综述生成
│   └── ...
├── db/                # 数据库
│   ├── schema.ts      # 表结构定义
│   └── migrations/    # 迁移文件（自动生成）
├── dist/              # 构建产物
│   ├── boot.js        # 后端服务器（Node.js）
│   └── public/        # 前端静态文件
├── src/               # 前端代码
│   └── App.tsx        # 主应用组件
├── railway.json       # Railway 部署配置
├── Dockerfile         # Docker 部署（备选）
└── package.json
```

---

## 故障排查

### 部署失败

1. **构建日志**：在 Railway 控制台查看 Build Logs
2. **常见错误**：
   - `DATABASE_URL not set` → 确保已添加 MySQL 数据库并关联服务
   - `esbuild not found` → 确保 `esbuild` 在 devDependencies 中

### 数据库迁移失败

1. 在 Railway 控制台点击数据库 → 查看连接信息
2. 确保 `DATABASE_URL` 格式正确：`mysql://user:password@host:port/database`

### 健康检查失败

1. 检查 `dist/boot.js` 是否正确生成
2. 检查环境变量是否正确设置
3. 检查端口是否为 3000（默认）

---

## 费用估算

| 资源 | 月费用（免费额度内） |
|------|----------|
| 应用服务 | $0（$5 免费额度足够） |
| MySQL 数据库 | $0（$5 免费额度足够） |
| 网络流量 | $0（每月前 100GB 免费） |
| DeepSeek API | ¥10 充值，足够数千次调用 |

---

## 部署后升级

### 更新代码

1. 修改本地代码
2. `git add . && git commit -m "Update" && git push`
3. Railway 自动检测 Git 推送并重新部署

### 添加自定义域名

1. Railway 控制台 → 你的服务 → Settings → Domains
2. 点击 **"Generate Domain"** 或使用自定义域名
3. 自动配置 HTTPS

### 监控

1. Railway 控制台提供 CPU、内存、网络监控
2. 日志查看：控制台 → 你的服务 → Logs
