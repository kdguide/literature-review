#!/bin/bash
# 文献综述助手 - VPS 一键部署脚本 (Ubuntu 22.04)
# 复制到服务器执行: bash deploy.sh

set -e

echo "===== 文献综述助手 一键部署 ====="
echo ""

APP_DIR="/opt/literature-review"
DEEPSEEK_KEY="sk-9e8a023f30cb4f68a05f33a9f678667c"

echo "[1/8] 安装基础工具..."
apt update
apt install -y curl git wget nginx

echo ""
echo "[2/8] 安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v

echo ""
echo "[3/8] 克隆项目..."
rm -rf $APP_DIR
git config --global http.sslVerify false
git clone https://github.com/kdguide/literature-review.git $APP_DIR
cd $APP_DIR

echo ""
echo "[4/8] 安装依赖..."
npm install

echo ""
echo "[5/8] 构建后端..."
npm run build

echo ""
echo "[6/8] 构建前端..."
npx vite build

echo ""
echo "[7/8] 配置环境变量..."
echo "DEEPSEEK_API_KEY=$DEEPSEEK_KEY" > .env
echo "DATABASE_URL=db.sqlite" >> .env

echo ""
echo "[8/8] 启动服务..."
npm install -g pm2
pm2 delete literature-review 2>/dev/null || true
NODE_ENV=production pm2 start dist/boot.js --name literature-review --cwd $APP_DIR
pm2 save --force
pm2 startup systemd

echo ""
echo "[9/8] 配置 Nginx..."
cat > /etc/nginx/sites-enabled/default << 'EOF'
server {
    listen 80 default_server;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF
nginx -t && systemctl restart nginx

echo ""
echo "===== 验证 ====="
sleep 3
pm2 status
curl -s http://localhost:3000/api/trpc/ping && echo "" || echo "API 未响应"

IP=$(curl -s ifconfig.me 2>/dev/null || echo "你的服务器IP")
echo ""
echo "========================================"
echo "✅ 部署完成！访问 http://$IP"
echo "========================================"
echo ""
echo "管理命令:"
echo "  pm2 status                    # 查看状态"
echo "  pm2 logs literature-review    # 查看日志"
echo "  pm2 restart literature-review # 重启服务"
