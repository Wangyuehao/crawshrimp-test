# SHEIN Product Feedback Filter Design

## Goal

Add three optional task parameters to the SHEIN product feedback export:

- 商品SKC
- 评价ID
- 评价星级

The existing behavior remains the default: when a new parameter is empty, the script inherits the current SHEIN page filter from the captured list request.

## Approach

The adapter will continue to capture the current `/goods/comment/list` request and replay it for full-page export. During template preparation, the script will merge requested filter parameters into the captured payload before pagination starts.

This keeps page-level filters such as 评价时间 intact and avoids brittle UI automation for the new fields.

## Parameters

The `product_feedback` task manifest will expose:

- `filter_skc`: textarea, label `商品SKC`, supports one or more values separated by newlines, commas, Chinese commas, semicolons, or whitespace.
- `filter_comment_id`: textarea, label `评价ID`, same normalization as SKC.
- `filter_star`: select, label `评价星级`, options: not specified, 1星, 2星, 3星, 4星, 5星.

## Payload Mapping

The script will prefer any matching key already present in the captured payload so it can follow SHEIN's current API shape. If no existing key is present, it will write fallback keys:

- 商品SKC -> `skc`
- 评价ID -> `commentId`
- 评价星级 -> `goodsCommentStar`

If a text parameter contains one value, the script writes a string. If it contains multiple values, the script writes an array. Empty parameters leave the captured payload unchanged.

## Summary And Progress

The existing filter summary will include the new filters when present so export progress and file context show what was requested.

## Tests

Add Node test coverage for:

- preparing a product feedback API template with the three new params
- payload fields being overwritten while pagination fields remain reset later during collection
- filter summary including SKC, 评价ID, and 星级
