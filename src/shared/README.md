# shared

预留的共享配置/路径工具目录。

当前实际的路径读取在：

- `src/dsh-pet-host/config.js`（host）
- `src/plugins/pink-diary/index.js`（插件）

两者都遵循：

1. 环境变量；
2. `~/.dsh/dsh-pet/pink-diary-pet.json`；
3. 默认 `~/.dsh/pink-diary` / `~/.dsh/dsh-pet/pictures`。
