#!/usr/bin/env python3
"""清理 DSH 桌面端堆积的 dsh-auth-* cookie。

背景
----
DSH 桌面端每次启动都会新发一个 `dsh-auth-<随机串>` cookie（同一个 host 127.0.0.1），
但从不删除上一次的。Chromium 的 cookie 不区分端口，所以它们全部对 127.0.0.1 生效。
重启次数多了以后，浏览器把几十条互不相同的 dsh-auth-* 一起塞进请求头，
服务端认证时看到一堆不认识的值 → `desktop welcome: Web authentication failed`，
应用起不来。删掉这些 cookie 后即可正常启动。

什么时候跑
----------
**DSH 完全退出后**（应用运行时 Cookies 数据库是锁着的）。建议每月一次，
或者每次大量重启 DSH 之后跑一次。

用法
----
    python clean-auth-cookies.py            # 清理默认位置
    python clean-auth-cookies.py --dry-run  # 只报告，不修改
    python clean-auth-cookies.py --db <path>  # 指定数据库（用于测试）

脚本会先把数据库备份成 Cookies.bak-<时间戳>，再删除所有 name LIKE 'dsh-auth-%' 的行，
最后 VACUUM 压缩。下次启动 DSH 会自动生成一条新的 cookie。
"""

import argparse
import os
import shutil
import sqlite3
import sys
import time

DEFAULT_DB = os.path.join(
    os.environ.get("APPDATA", os.path.expanduser("~")),
    "@deepseek-ai",
    "dsh-desktop",
    "Network",
    "Cookies",
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DEFAULT_DB, help="Cookies 数据库路径")
    ap.add_argument("--dry-run", action="store_true", help="只统计，不删除")
    ap.add_argument("--quiet", action="store_true", help="只在出错时输出")
    args = ap.parse_args()

    def say(msg):
        if not args.quiet:
            print(msg)

    db = args.db
    if not os.path.exists(db):
        print(f"[ERR] 找不到 Cookies 数据库：{db}")
        print("      如果 DSH 从未登录过桌面端，这是正常的。")
        return 1

    # 先备份
    if not args.dry_run:
        bak = f"{db}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(db, bak)
        say(f"[1/3] 已备份 → {os.path.basename(bak)}")
    else:
        say("[1/3] dry-run：跳过备份")

    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
    except sqlite3.Error as e:
        print(f"[ERR] 打不开数据库（DSH 还在运行？先完全退出）：{e}")
        return 1

    try:
        cur.execute("select count(*) from cookies where name like 'dsh-auth-%'")
        before = cur.fetchone()[0]
        cur.execute("select count(*) from cookies")
        total = cur.fetchone()[0]
        say(f"[2/3] 当前 cookie 总数 {total}，其中 dsh-auth-* 共 {before} 条")

        if args.dry_run:
            say("[3/3] dry-run：不修改")
            return 0

        cur.execute("delete from cookies where name like 'dsh-auth-%'")
        removed = cur.rowcount
        con.commit()
        con.execute("vacuum")
        con.commit()
        say(f"[3/3] 已删除 {removed} 条 dsh-auth-* cookie（其余 cookie 保留）")
        say("      下次启动 DSH 会自动生成一条新的认证 cookie。")
        return 0
    except sqlite3.Error as e:
        print(f"[ERR] 操作失败：{e}")
        return 1
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
