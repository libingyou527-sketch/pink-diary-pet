# DSH 桌面端认证 cookie 维护

> 症状：启动 DeepSeek Harness 弹窗
> `desktop welcome: Web authentication failed` / "The application could not start"，
> 删掉一堆 cookie 之后才进得去。

## 根因

DSH 桌面端**每次启动都会新发一个随机名的认证 cookie**，而且从不删除旧的：

```text
名字     dsh-auth-<随机串>（每次都不一样）
host     127.0.0.1（Chromium 的 cookie 不区分端口，所以所有实例共享同一个 host）
过期     约 30 天（不会自己消失）
```

重启次数多了以后，浏览器把几十条互不相同的 `dsh-auth-*` 一起塞进请求头，
服务端认证时看到一堆不认识的值 → 直接判失败 → 应用起不来。

2026-11-18 实测：删除前 **71 条**全部是 `dsh-auth-*`，删完立刻能启动。

## 工具

```text
tools/dsh/clean-auth-cookies.py        清理脚本（Python，用仓库里那个 GPT env 的 python 即可）
tools/dsh/清理DSH认证cookie.bat        双击版（先退出 DSH 再运行）
tools/dsh/启动DeepSeek Harness.bat     先清理再启动，日常用这个最省事
```

脚本行为：

```text
1. 把 Cookies 数据库备份成 Cookies.bak-<时间戳>
2. 删除所有 name LIKE 'dsh-auth-%' 的行（其他 cookie 不动）
3. VACUUM 压缩
```

参数：`--dry-run` 只看不改；`--quiet` 只在出错时输出；`--db <path>` 指定数据库（测试用）。

## 什么时候跑

```text
· 启动失败、看到 Web authentication failed 时 → 先完全退出 DSH，再跑清理
· 大量重启 DSH 之后（比如今天这种密集调试）
· 平时想避免的话：用「启动DeepSeek Harness.bat」代替原来的快捷方式
```

**注意**：DSH 运行时 `Cookies` 数据库是锁着的，脚本会报"打不开"——必须先完全退出
（托盘图标也要退），再运行。

## 为什么不用其他方案

```text
· 改端口：没用。cookie 的 host 是 127.0.0.1，不含端口，换端口反而只是多一条 cookie。
· 改 cookie 名：那是 DSH 内部的命名，改不了。
· 让 DSH 自己清理：它没有清理逻辑（这算 DSH 的一个缺陷，值得向上游反馈）。
```

## 预防建议

```text
1. 日常用 tools/dsh/启动DeepSeek Harness.bat 启动（自带清理）
2. 若想零感知：登录时用计划任务跑一次 clean-auth-cookies.py --quiet
   （要在 DSH 启动之前，否则库被锁）
```
