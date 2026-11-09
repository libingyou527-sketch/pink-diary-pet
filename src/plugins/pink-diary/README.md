# 粉色日记插件

DSH 侧栏插件：读取、写入、删除粉色日记 Markdown。

## 目录

默认：

```text
~/.dsh/pink-diary
```

可通过环境变量或运行时配置修改：

```env
PINK_DIARY_DIR=~/.dsh/pink-diary
```

插件在启动/首次访问时会 `mkdir -p`，目录不存在不会报错。

## API

```text
GET  /xu-diary
POST /xu-diary
```

## 特性

- 按天分文件；
- 支持让絮写当天日记；
- 支持让絮读某篇日记；
- 删除日记；
- 日记图片日志已在写入层过滤：纯图片不写，图文只写文字。

## 安全

插件只读写配置指定的日记目录，不读取 `memory.json` 或 QQ 私聊历史。
