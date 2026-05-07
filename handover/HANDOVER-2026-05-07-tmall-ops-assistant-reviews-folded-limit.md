# HANDOVER 2026-05-07 - 天猫运营助手评价抓取折叠限制与降频建议

## 当前目标

继续开发 `tmall-ops-assistant` 适配器，任务是抓取天猫商品买家评价。用户最新反馈：

- 页面显示 `用户评价·500+`，20 条明显不够，希望尽可能多抓。
- 已确认页面底部显示 `已折叠507条对你帮助不大的评价`，用户判断其余评价显示不出来应与折叠机制有关。
- 用户明确要求降低抓取频率，避免触发淘宝反爬。

工作区：

```text
/Users/xingyicheng/Downloads/crawshrimp
```

当前分支：

```text
codex/tmall-ops-assistant-reviews
```

## 当前代码状态

新增文件仍未跟踪：

```text
?? adapters/tmall-ops-assistant/
?? handover/HANDOVER-2026-05-07-tmall-ops-assistant-reviews.md
?? tests/tmall-buyer-reviews.test.js
```

另外存在无关未跟踪目录：

```text
?? docs/
```

不要删除或混入无关 `docs/`。

主要任务文件：

```text
adapters/tmall-ops-assistant/manifest.yaml
adapters/tmall-ops-assistant/auth_check.js
adapters/tmall-ops-assistant/buyer-reviews.js
tests/tmall-buyer-reviews.test.js
```

当前实现要点：

- `buyer-reviews.js` 已使用真实页面 MTop API：
  - `mtop.taobao.rate.detaillist.get`
  - `v=6.0`
  - `appKey=12574478`
  - 复用 `window.lib.mtop.request`，不手写 `_m_h5_tk` 签名。
- `page_size` 被限制到最大 20，因为实测 `pageSize=50` 会让接口第一页直接返回 47 条并 `hasNext:false`，破坏正常分页。
- `max_pages` 默认 30，但实际按 `hasNext` 提前停止。
- 当前节流常量仍是：

```js
const REQUEST_DELAY_MS = 350
```

这与用户最新要求不符，下一步必须改为更保守的随机延迟。

## 已通过验证

此前已通过：

```bash
node --check adapters/tmall-ops-assistant/buyer-reviews.js
node --check adapters/tmall-ops-assistant/auth_check.js
node --test tests/tmall-buyer-reviews.test.js
./venv/bin/python -m unittest tests.test_adapter_loader -v
```

 live smoke 结果：

- 单商品 `max_pages=1`：20 行。
- 三商品 `max_pages=1`：60 行，每商品 20 行，无重复评价 ID。
- 单商品 `max_pages=30`：最终只导出 47 行，页分布为 20 / 20 / 7。

## 核心调查结论

样例商品：

```text
https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879
```

页面显示：

```text
用户评价·500+
已折叠507条对你帮助不大的评价
```

当前已确认：

1. 天猫详情页真实使用 `mtop.taobao.rate.detaillist.get / 6.0` 加载评价。
2. 该接口返回字段包含：
   - `rateList`
   - `hasNext`
   - `feedAllCount = "500"`
   - `feedAllCountFuzzy = "500+"`
   - `foldCount = "507"`
3. 实测分页只返回 47 条唯一评价：
   - page 1: 20, `hasNext:true`
   - page 2: 20, `hasNext:true`
   - page 3: 7, `hasNext:false`
4. 点击页面底部 `已折叠507条...` 不会触发新的请求，也不会展开列表。
5. 分类标签如 `图/视频15`、`追评1`、关键词标签只是这 47 条内的子集，不能增加唯一评价量。

## 新 API 调查结果

在懒加载 chunk `detail-info.js` 中找到了评价组件的第二套 API：

```text
mtop.alibaba.review.list.for.new.pc.detail / 1.0
```

来源：

```text
/tmp/tmall-js/detail-info.js
```

关键代码形状：

```js
Li = data => Ei(
  "mtop.alibaba.review.list.for.new.pc.detail",
  "1.0",
  data,
  { ttid: "2022@taobao_litepc_9.17.0", AntiFlood: true, AntiCreep: true, timeout: 20000 }
)
```

页面 webpack runtime 可直接拿到模块：

```js
window.webpackChunk_ali_tbpc_pc_detail_ssr_2025.push([
  [999997],
  {},
  req => { mod = req(85466) }
])
```

其中：

- `mod.DF` -> `mtop.taobao.rate.detaillist.get / 6.0`
- `mod.nr` -> `mtop.alibaba.review.list.for.new.pc.detail / 1.0`

新 API 成功请求参数：

```json
{
  "itemId": "919643072179",
  "bizCode": "ali.china.tmall",
  "channel": "pc_detail",
  "pageSize": 20,
  "pageNum": 1,
  "orderType": ""
}
```

响应结构：

```text
data.module.reviewVOList[]
data.module.hasNext
data.module.foldFlagCount
```

分页探针结果：

```json
{
  "unique": 47,
  "dupes": 0,
  "pages": [
    { "pageNum": 1, "count": 20, "hasNext": "true", "foldFlagCount": "507" },
    { "pageNum": 2, "count": 20, "hasNext": "true", "foldFlagCount": "507" },
    { "pageNum": 3, "count": 7, "hasNext": "false", "foldFlagCount": "507" }
  ]
}
```

结论：新 API 与当前 H5 API 一样，只暴露 47 条可见评价。折叠的 507 条目前只返回计数，不返回评价明细。

## 重要文件和临时探针

CDP Chrome：

```text
tab id: 9BC99DAF9CDA5C2CF2912128676E5DF9
url: https://detail.tmall.com/item.htm?id=919643072179&skuId=5789814873879
```

有用临时文件：

```text
/tmp/cdp_eval.py
/tmp/cdp_cmd.py
/tmp/tmall-p_home.js
/tmp/tmall-js/detail-info.js
/tmp/tmall-js/p_home.js
```

`/tmp/cdp_eval.py` 能直接对当前 Chrome tab 执行 JS，绕过 dev harness 长时间运行后偶发的登录态误判。

## 下一步建议

1. 先停止继续探测折叠评价展开路径。

   已验证两个页面官方评价 API 都只返回 47 条；折叠 507 条未暴露明细。继续高频试参容易增加风控风险，收益很低。

2. 改抓取节流。

   建议将固定 `350ms` 改为随机延迟：

   ```text
   页间延迟：1500-3500ms
   商品间延迟：4000-8000ms
   ```

   可以新增 helper，例如 `sleepRandom(min, max)`。批量商品时尤其要降速。

3. 避免双 API 串行抓同一商品。

   因为 `review.list.for.new.pc.detail` 没有突破 47 条，不建议在生产抓取中对同一商品同时打两套评价接口。保留当前 `mtop.taobao.rate.detaillist.get` 即可，减少请求量。

4. 更新用户可见说明和 manifest hint。

   当前 `manifest.yaml` 的 `max_pages` hint 写着：

   ```text
   500+ 评价通常可抓取约 500 条
   ```

   这已被实测推翻。建议改为：

   ```text
   默认最多尝试 30 页，按接口 hasNext 自动提前停止；天猫可能折叠部分评价，接口只返回可见评价明细。
   ```

5. 在导出元数据或备注中记录折叠信息。

   建议从响应中提取：

   - `feedAllCountFuzzy`
   - `foldCount`
   - `foldInfo`
   - `firstPageTips`

   可放在 `meta.shared`，或在每个商品完成时添加摘要字段，方便用户理解为什么 `500+` 最终只有 47 条。

6. 调整测试。

   推荐新增/修改测试：

   - `foldCount` / `feedAllCountFuzzy` 会进入 `meta.shared` 或诊断摘要。
   - 默认深翻测试不要再写“500+ 通常可抓约 500 条”这类假设。
   - 节流 helper 可以用注入/覆盖方式测试范围，避免单测真实等待。

7. 重新验证和打包。

   修改后运行：

   ```bash
   node --check adapters/tmall-ops-assistant/buyer-reviews.js
   node --check adapters/tmall-ops-assistant/auth_check.js
   node --test tests/tmall-buyer-reviews.test.js
   ./venv/bin/python -m unittest tests.test_adapter_loader -v
   ```

   然后重装 link 并 live smoke：

   ```bash
   curl -sS --max-time 5 -X POST http://127.0.0.1:18765/adapters/install \
     -H 'Content-Type: application/json' \
     -d '{"path":"/Users/xingyicheng/Downloads/crawshrimp/adapters/tmall-ops-assistant","install_mode":"link"}'
   ```

   重新打包：

   ```bash
   rm -f dist/adapters/tmall-ops-assistant-v0.1.0.zip
   (cd adapters && zip -qr ../dist/adapters/tmall-ops-assistant-v0.1.0.zip tmall-ops-assistant)
   unzip -l dist/adapters/tmall-ops-assistant-v0.1.0.zip
   ```

## 建议对用户的解释

可以明确说明：

```text
我已经验证了天猫当前页面的两套官方评价接口。页面显示 500+，但接口同时返回了 foldCount=507，并且实际只暴露 47 条“为你展示真实评价”的明细。折叠的 507 条目前只有计数，没有评价列表接口响应，所以适配器能稳定导出的上限就是接口暴露的可见评价。后续会降低请求频率，并在导出/日志里标注折叠数量，避免用户误以为是抓取漏页。
```

