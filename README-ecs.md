# 阿里云 ECS 自托管版

该版本适合部署到阿里云香港 ECS。网页、账号和库存数据库均运行在 ECS 上，不依赖 Vercel 或 Supabase。

## 重要安全要求

- 没有域名和 HTTPS 时只能使用虚拟账号、虚拟库存测试，不能输入真实密码或正式实验数据。
- `POSTGRES_PASSWORD` 和 `AUTH_SECRET` 只放在 ECS 的 `.env`，不要提交 GitHub。
- 安全组公开 80/443；SSH 只允许管理员可信 IP；不要公开 5432。
- 注册默认开放。若出现垃圾注册，在 `.env` 设置 `REGISTRATION_ENABLED=false` 后重新创建 app 容器。

## ECS 首次准备

在 Alibaba Cloud Linux 上安装 Docker 和 Compose，然后创建部署目录：

```bash
mkdir -p ~/cryobox && cd ~/cryobox
```

复制 `docker-compose.yml`、`db/`、`infra/` 到该目录，创建 `.env`：

```bash
cp .env.example .env
openssl rand -hex 24
```

把生成的随机值分别填入 `AUTH_SECRET` 和数据库密码。`CRYOBOX_IMAGE` 指向 GitHub Actions 构建的镜像；如果镜像不是公开的，需要在 ECS 登录 GHCR。

## 启动和更新

```bash
docker compose pull
docker compose up -d
curl http://127.0.0.1/api/health
```

更新时先拉取指定版本，再执行：

```bash
CRYOBOX_IMAGE=ghcr.io/lbs4444/cryobox-manager:<commit-sha> docker compose up -d app
```

健康检查返回 `{"ok":true}` 后，再通过公网 IP 访问。PostgreSQL 数据保存在 Docker volume 中，重建 app 容器不会删除库存。

## 备份

在部署目录运行：

```bash
CRYOBOX_BACKUP_DIR=/var/backups/cryobox ./infra/backup.sh
```

建议使用 cron 每天执行，并将生成的压缩备份复制到私有 OSS。至少实际恢复一次：

```bash
gunzip -c /var/backups/cryobox/cryobox-YYYYMMDDTHHMMSSZ.sql.gz | docker compose exec -T db psql -U cryobox -d cryobox
```

## 旧数据迁移

1. 在旧 Supabase 网站中导出完整 JSON。
2. 在 ECS 版重新注册账号。
3. 进入“系统设置 → 导入 JSON”。
4. 检查冰箱、冻存盒、样品和更新记录后再开始正式使用。

Supabase 密码不会迁移，必须在 ECS 版重新注册。

## 域名和 HTTPS

测试通过后，将域名解析到 ECS 公网 IP，配置 Nginx HTTPS 证书，并把 `infra/nginx/https.conf.example` 中的示例域名替换为实际域名。证书生效后强制 HTTP 跳转 HTTPS，再迁移真实库存。
