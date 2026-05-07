import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTaskRunnerProgressSummary,
  resolveTaskProgressConfig,
} from './taskProgress.js'

test('tmall material match-buy uses Semir batch download progress in task runner', () => {
  const config = resolveTaskProgressConfig('semir-cloud-drive', 'tmall_material_match_buy')
  assert.equal(config.mode, 'enhanced')
  assert.equal(config.usage.taskRunner, 'enhanced')

  const summary = buildTaskRunnerProgressSummary({
    adapterId: 'semir-cloud-drive',
    taskId: 'tmall_material_match_buy',
    liveStatus: 'running',
    isRunning: true,
    live: {
      status: 'running',
      phase: 'collect_job',
      current: 1,
      total: 2,
      buyer_id: '109326124011',
      store: '26Q2/模拍',
      download_total: 5,
      download_completed: 2,
      download_success: 2,
      download_concurrency: 10,
      download_retry_attempts: 3,
      download_started: true,
      download_active: true,
    },
  })

  assert.equal(summary.title, '双阶段进度')
  assert.equal(summary.ariaLabel, '森马云盘双阶段进度')
  assert.equal(summary.tracks.length, 2)
  assert.equal(summary.tracks[0].title, '上层 · 检索链接')
  assert.equal(summary.tracks[0].main, '1 / 2 个编码')
  assert.equal(summary.tracks[1].title, '下层 · 批量下载')
  assert.equal(summary.tracks[1].main, '2 / 5 个文件')
})

test('tiktok creator video download uses two-stage progress in task runner', () => {
  const config = resolveTaskProgressConfig('tiktok-ops-assistant', 'creator_video_download')
  assert.equal(config.mode, 'enhanced')
  assert.equal(config.usage.taskRunner, 'enhanced')

  const probeSummary = buildTaskRunnerProgressSummary({
    adapterId: 'tiktok-ops-assistant',
    taskId: 'creator_video_download',
    liveStatus: 'running',
    isRunning: true,
    live: {
      status: 'running',
      phase: 'main',
      current: 1,
      total: 4,
      buyer_id: '7619062455813131550',
      store: 'TikTok达人视频下载 / US',
      search_total_codes: 4,
      search_completed_codes: 1,
      download_total: 0,
      download_completed: 0,
      download_started: false,
      download_active: false,
    },
  })

  assert.equal(probeSummary.title, '双阶段进度')
  assert.equal(probeSummary.tracks.length, 2)
  assert.equal(probeSummary.tracks[0].title, '第一阶段 · 探查视频')
  assert.equal(probeSummary.tracks[0].main, '1 / 4 条视频')
  assert.equal(probeSummary.tracks[1].title, '第二阶段 · 批量下载')
  assert.equal(probeSummary.tracks[1].percentLabel, '待开始')

  const downloadSummary = buildTaskRunnerProgressSummary({
    adapterId: 'tiktok-ops-assistant',
    taskId: 'creator_video_download',
    liveStatus: 'running',
    isRunning: true,
    live: {
      status: 'running',
      phase: 'after_download',
      current: 4,
      total: 4,
      buyer_id: '7619062455813131550',
      store: 'TikTok达人视频下载 / US',
      search_total_codes: 4,
      search_completed_codes: 4,
      download_total: 4,
      download_completed: 2,
      download_success: 2,
      download_failed: 0,
      download_started: true,
      download_active: true,
      download_concurrency: 2,
      download_retry_attempts: 2,
      download_current_label: 'US_7619062455813131550.mp4',
    },
  })

  assert.equal(downloadSummary.title, '双阶段进度')
  assert.equal(downloadSummary.tracks[0].main, '4 / 4 条视频')
  assert.equal(downloadSummary.tracks[1].main, '2 / 4 个视频')
  assert.match(downloadSummary.sub, /批量下载/)
})
