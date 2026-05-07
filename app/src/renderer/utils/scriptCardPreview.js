const PREVIEW_ROW_COUNT = 3
const CHIP_LINE_HEIGHT = 30
const PREVIEW_VISIBLE_TASK_COUNT = 6

export function getScriptCardTaskPreviewMeta(group) {
  const taskCount = Array.isArray(group?.tasks) ? group.tasks.length : 0
  const hiddenTaskCount = Math.max(0, taskCount - PREVIEW_VISIBLE_TASK_COUNT)
  return {
    maxRows: PREVIEW_ROW_COUNT,
    maxHeight: PREVIEW_ROW_COUNT * CHIP_LINE_HEIGHT,
    hiddenTaskCount,
    isOverflowing: hiddenTaskCount > 0,
  }
}
