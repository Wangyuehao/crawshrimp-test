# HANDOVER 2026-05-07 - 天猫运营助手买家评价抓取

## 背景

本轮目标是利用 crawshrimp 项目已有的 adapter SDK、`crawshrimp-adapter-skill`、`web-automation-skill` 和 dev harness，生成新的适配包「天猫运营助手」，抓取天猫商品链接下的买家评价数据。

用户提供了 3 条天猫商品详情链接，核心商品 ID / SKU 为：

- `919643072179` / `5789814873879`
- `1023254962064` / `6034929285662`
- `732533512173` / `6038497472965`

## 当前代码状态

已新增 adapter 源码：

- `adapters/tmall-ops-assistant/manifest.yaml`
- `adapters/tmall-ops-assistant/auth_check.js`
- `adapters/tmall-ops-assistant/buyer-reviews.js`
- `tests/tmall-buyer-reviews.test.js`

已生成可导入包：

- `dist/adapters/tmall-ops-assistant-v0.1.0.zip`

当前 `git status --short --untracked-files=all` 显示这些本轮新增文件仍未跟踪：

```text
?? adapters/tmall-ops-assistant/auth_check.js
?? adapters/tmall-ops-assistant/buyer-reviews.js
?? adapters/tmall-ops-assistant/manifest.yaml
?? tests/tmall-buyer-reviews.test.js
```

另有本轮开始前就存在的未跟踪 `docs/superpowers/...` 文件，不属于本任务，不要误删或混入本任务提交。

## 已完成验证

已通过：

```bash
node --check adapters/tmall-ops-assistant/buyer-reviews.js
node --check adapters/tmall-ops-assistant/auth_check.js
node --test tests/tmall-buyer-reviews.test.js
./venv/bin/python -m unittest tests.test_adapter_loader -v
```

测试覆盖：

- 示例链接解析为商品 ID / SKU。
- API 响应归一化成导出行。
- 页面内嵌评价数据兜底。
- 全局内嵌数据只用于当前商品，避免批量链接串数据。
- 天猫返回验证 / 风控 JSON 时输出诊断行。

## 重要纠偏

最初实现中的 `buyer-reviews.js` 使用了旧猜测接口：

```text
https://rate.tmall.com/list_detail_rate.htm
```

后续按用户要求启动 CDP Chrome、连接项目 dev harness 探查真实页面后，确认新版天猫详情页实际使用的是 MTop 接口。当前源码还没有完全切换到真实 MTop 接口，这是下一步必须处理的点。

## 真实 CDP / dev harness 探查证据

已启动专用 Chrome：

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-crawshrimp \
  --no-first-run \
  --no-default-browser-check \
  "https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879"
```

CDP 状态：

- `http://127.0.0.1:9222/json/version` 可用。
- crawshrimp `/health` 返回 `chrome:true`。
- adapter 已用 `install_mode=link` 安装到运行时。

安装命令：

```bash
curl -sS --max-time 5 -X POST http://127.0.0.1:18765/adapters/install \
  -H 'Content-Type: application/json' \
  -d '{"path":"/Users/xingyicheng/Downloads/crawshrimp/adapters/tmall-ops-assistant","install_mode":"link"}'
```

dev harness snapshot 看到真实商品页：

```text
url: https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879
title: 英氏儿童内裤纯棉男童平角底裤男孩四角短裤中大童不夹pp抑菌A类-tmall.com天猫
```

DOM 扫描结论：

- 页面已渲染新版详情页 `2025SSR`。
- 页面 body 中已有「用户评价·500+」「好评率98.6%」和两条首屏评价。
- 「查看全部评价」按钮真实坐标约为 `(351, 593)`。
- 登录态 Cookie 存在：`tracknick`、`lgc`、`sn`、`_tb_token_`、`_m_h5_tk`、`_m_h5_tk_enc` 等。
- 页面存在 `window.lib.mtop` 和 `window.__UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__`，可复用页面自己的 MTop 客户端，避免手写签名。

点击「查看全部评价」并捕获网络请求：

```bash
./venv/bin/python scripts/crawshrimp_dev_harness.py capture \
  --adapter tmall-ops-assistant \
  --task buyer_reviews \
  --current-tab-id 9BC99DAF9CDA5C2CF2912128676E5DF9 \
  --capture-mode click \
  --click 351,593 \
  --matches-json '[{"url_contains":"rate"},{"url_contains":"review"},{"url_contains":"comment"},{"url_contains":"mtop"},{"url_contains":"h5api"}]' \
  --timeout-ms 12000 \
  --settle-ms 1500 \
  --min-matches 0
```

捕获到真实接口：

```text
https://h5api.m.tmall.com/h5/mtop.taobao.rate.detaillist.get/6.0/
```

关键 query：

```text
api=mtop.taobao.rate.detaillist.get
v=6.0
appKey=12574478
dataType=jsonp
type=jsonp
valueType=string
```

真实 `data` 参数：

```json
{
  "showTrueCount": false,
  "auctionNumId": "919643072179",
  "pageNo": 1,
  "pageSize": 20,
  "orderType": "",
  "searchImpr": "-8",
  "expression": "",
  "skuVids": "",
  "rateSrc": "pc_rate_list",
  "rateType": "",
  "foldFlag": "0"
}
```

响应结构关键字段：

```text
data.rateList[]
data.hasNext = "true"
data.feedAllCount = "500"
data.feedAllCountFuzzy = "500+"
data.foldCount = "507"
data.imprItemVOS[]
data.imprNewItemVOS[]
```

单条评价字段示例：

```text
id
auctionNumId
auctionTitle
feedback
feedbackDate
createTime
skuId
skuMap
skuValueStr
userNick
reduceUserNick
feedPicList
feedPicPathList
rateType
reply
share.detailUrl
```

## 下一步必须做

1. 用 dev harness eval 探查 `window.lib.mtop` 的调用方式。

   建议从下面方向继续：

   ```js
   Object.keys(window.lib.mtop)
   typeof window.lib.mtop.request
   await window.__UNIVERSAL_MTOP_APPEND_LIB_MTOP_IN_BROWSER__
   ```

2. 把 `buyer-reviews.js` 的远程抓取从旧接口切换为真实 MTop：

   ```text
   mtop.taobao.rate.detaillist.get / v6.0
   ```

3. 使用页面自己的 MTop 客户端发请求，保留同页面 Cookie / token / sign，不要手写 `_m_h5_tk` 签名。

4. 更新归一化字段：

   - `feedback` -> `评价内容`
   - `feedbackDate` / `createTime` -> `评价时间`
   - `reduceUserNick` / `userNick` -> `买家昵称`
   - `skuMap` / `skuValueStr` -> `规格`
   - `feedPicPathList` / `feedPicList[].thumbnail` -> `评价图片`
   - `id` -> `评价ID`
   - `auctionTitle` -> `商品标题`

5. 更新 tests：

   - 新增真实 MTop response fixture。
   - 断言 `data.rateList` 能归一化。
   - 断言 `hasNext === "true"` 时按 `max_pages` 继续翻页。

6. 在已登录 CDP Chrome 中运行真实 adapter smoke：

   - 当前商品单链接先跑 `max_pages=1`。
   - 再跑用户给的 3 条链接，确认是否每个商品都能通过 MTop 返回评价。
   - 检查导出 Excel 行数、重复评价 ID、失败诊断行。

## 关键注意事项

- 不要再把命令行 `fetch` 结果当作真实页面结论。天猫接口依赖页面 Cookie / MTop 签名 / 登录态，必须通过 CDP 中已登录详情页验证。
- 当前专用 Chrome 已具备登录态，`document.cookie` 中能看到天猫相关 token。
- `capture_click_requests` 已证明真实请求路径存在，下一步优先复用 `window.lib.mtop`，而不是构造裸 URL。
- `dist/adapters/tmall-ops-assistant-v0.1.0.zip` 是旧实现打出的包，在切到真实 MTop 后需要重新生成。

## 推荐继续命令

查看 tab：

```bash
curl -sS --max-time 5 http://127.0.0.1:18765/settings/chrome-tabs | python3 -m json.tool
```

重新 snapshot：

```bash
./venv/bin/python scripts/crawshrimp_dev_harness.py snapshot \
  --adapter tmall-ops-assistant \
  --task buyer_reviews \
  --current-tab-id 9BC99DAF9CDA5C2CF2912128676E5DF9 \
  --include-framework
```

重新打包：

```bash
rm -f dist/adapters/tmall-ops-assistant-v0.1.0.zip
(cd adapters && zip -qr ../dist/adapters/tmall-ops-assistant-v0.1.0.zip tmall-ops-assistant)
unzip -l dist/adapters/tmall-ops-assistant-v0.1.0.zip
```

