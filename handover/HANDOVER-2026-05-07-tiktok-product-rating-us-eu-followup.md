# TikTok Product Rating Follow-Up

Date: 2026-05-07

## Current Decision

US product rating is the immediate target. EU/FR follow-up is intentionally parked for later.

## US Verification

- `mode=new` with `shop_regions=["US"]` opens:
  `https://seller.us.tiktokshopglobalselling.com/product/rating?shop_region=US`
- Live run `419` completed successfully.
- Records: 20.
- Export:
  `/Users/xingyicheng/.crawshrimp/data/tiktok-ops-assistant/product_rating/TikTok商品评分__20260507-193434.xlsx`
- Export verified with openpyxl:
  21 rows including header, 26 columns.

## US Root Cause

US Seller Center review list requests work through same-origin Seller Center API:

`https://seller.us.tiktokshopglobalselling.com/api/v1/review/biz_backend/list`

Using `api16-normal-useast5...` from the US page can trigger TikTok's wrapped fetch error:

`Cannot set properties of undefined (setting 'request')`

So US should not reuse stale `performance` entries from manual probes or previous api16 attempts.

## Parked EU/FR Notes

FR/EU page does not use the same request path as US in the observed session. Earlier probing showed:

- EU host: `seller.eu.tiktokshopglobalselling.com/product/rating?shop_region=FR`
- Review list API observed on:
  `https://api16-normal-no1a.tiktokshopglobalselling.com/api/v1/review/biz_backend/list`
- FR must use the local regional seller ID from `window.__SELLER_USER_STORE__.regions`, e.g. `8648408801229380344`, not the US/global seller ID.
- Cross-origin EU api16 fetch needs `credentials: "include"`; without it, the endpoint returned `{"code":98001002,"message":""}`.

This path needs a separate hardening pass before treating multi-EU as complete.
