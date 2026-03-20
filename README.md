# Egern-Sub-Widget

机场订阅流量聚合组件，支持 Surge / Egern。

当前仓库基于旧项目 `Egern-Panel` 迁移，保留 10 组订阅参数的填写方式，支持直接填写原始机场订阅链接，无需手动 URL 编码。

## 安装方式

模块订阅链接：

```text
https://raw.githubusercontent.com/s486tt-ship-it/Egern-Sub-Widget/main/机场流量信息面板.sgmodule
```

在 Surge / Egern 中将上面的链接作为模块导入即可。

## 功能说明

- 支持最多 10 个机场订阅。
- 支持直接填写原始机场订阅链接。
- 未填写链接的项目会在展示时自动跳过。
- 机场名称可留空，脚本会自动回退为订阅链接域名。
- 可选填写每月重置日，用于显示距离下次重置的剩余天数。
- 自动尝试 clash-verge-rev / clash-verge / mihomo 的常见请求方式提升兼容性。

## 仓库说明

- 当前仓库：`https://github.com/s486tt-ship-it/Egern-Sub-Widget`
- 旧项目仓库：`https://github.com/s486tt-ship-it/Egern-Panel`
