import tempfile
import unittest
import zipfile
from pathlib import Path

import yaml

from core.api_server import (
    _cleanup_orphaned_runtime_artifacts,
    _finalize_tiktok_creator_video_outputs,
)

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "adapters" / "tiktok-ops-assistant" / "manifest.yaml"


class TiktokCreatorVideoPackagingTests(unittest.TestCase):
    def test_manifest_declares_export_folder_for_creator_video_download(self):
        manifest = yaml.safe_load(MANIFEST_PATH.read_text(encoding="utf-8"))
        task = next(item for item in manifest["tasks"] if item["id"] == "creator_video_download")
        params = {item["id"]: item for item in task["params"]}

        self.assertEqual(params["time_range"]["type"], "select")
        self.assertEqual(params["time_range"]["default"], "last7")
        self.assertEqual(
            [item["value"] for item in params["time_range"]["options"]],
            ["last7", "last28", "last_week", "custom"],
        )
        self.assertEqual(params["date_range"]["visible_when"], {"field": "time_range", "equals": "custom"})
        self.assertEqual(params["product_id"]["type"], "text")
        self.assertIn("商品ID", params["product_id"]["label"])
        self.assertEqual(params["package_name"]["type"], "text")
        self.assertIn("导出包", params["package_name"]["label"])
        self.assertEqual(params["output_dir"]["type"], "directory")
        self.assertIn("下载目录", params["output_dir"]["label"])

    def test_finalize_outputs_writes_default_task_named_zip_next_to_excel_and_cleans_runtime(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            runtime_dir = base / "runtime"
            output_dir = base / "outputs"
            runtime_dir.mkdir()
            output_dir.mkdir()

            video_a = runtime_dir / "US_761_a.mp4"
            video_b = runtime_dir / "US_761_b.mp4"
            video_a.write_bytes(b"a")
            video_b.write_bytes(b"b")
            exported = output_dir / "summary.xlsx"
            exported.write_bytes(b"excel")

            result = _finalize_tiktok_creator_video_outputs(
                data_rows=[
                    {
                        "区域": "US",
                        "视频ID": "761_a",
                        "计划文件名": "US_761_a.mp4",
                        "下载结果": "已下载",
                        "本地文件": str(video_a),
                    },
                    {
                        "区域": "US",
                        "视频ID": "761_b",
                        "计划文件名": "US_761_b.mp4",
                        "下载结果": "已下载",
                        "本地文件": str(video_b),
                    },
                ],
                runtime_files=[str(video_a), str(video_b)],
                exported_files=[str(exported)],
                run_params={},
                runtime_artifact_dir=str(runtime_dir),
                log=lambda _: None,
            )

            self.assertEqual(len(result), 2)
            zip_path = Path(result[0])
            self.assertEqual(zip_path.parent, output_dir)
            self.assertRegex(zip_path.name, r"^达人视频下载_\d{8}_\d{6}\.zip$")
            self.assertTrue(zip_path.is_file())
            self.assertEqual(Path(result[1]), exported)
            with zipfile.ZipFile(zip_path) as archive:
                names = archive.namelist()
                self.assertTrue(any(name.endswith("/US_761_a.mp4") for name in names))
                self.assertTrue(any(name.endswith("/US_761_b.mp4") for name in names))
            self.assertFalse(runtime_dir.exists())

    def test_finalize_outputs_copies_zip_and_excel_to_export_folder(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            runtime_dir = base / "runtime"
            export_dir = base / "exports"
            runtime_dir.mkdir()

            video_a = runtime_dir / "US_761_a.mp4"
            video_a.write_bytes(b"a")
            exported = base / "summary.xlsx"
            exported.write_bytes(b"excel")

            result = _finalize_tiktok_creator_video_outputs(
                data_rows=[
                    {
                        "区域": "US",
                        "视频ID": "761_a",
                        "计划文件名": "US_761_a.mp4",
                        "下载结果": "已下载",
                        "本地文件": str(video_a),
                    },
                ],
                runtime_files=[str(video_a)],
                exported_files=[str(exported)],
                run_params={
                    "package_name": "TikTok达人视频包",
                    "output_dir": str(export_dir),
                },
                runtime_artifact_dir=str(runtime_dir),
                log=lambda _: None,
            )

            self.assertEqual(len(result), 2)
            self.assertTrue(all(str(path).startswith(str(export_dir)) for path in result))
            self.assertTrue(any(Path(path).suffix == ".zip" for path in result))
            self.assertTrue(any(Path(path).name == "summary.xlsx" for path in result))
            self.assertFalse(runtime_dir.exists())

    def test_finalize_outputs_keep_only_excel_when_no_success_downloads(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            runtime_dir = base / "runtime"
            runtime_dir.mkdir()
            partial = runtime_dir / "US_761_a.mp4.part"
            partial.write_bytes(b"partial")
            exported = base / "summary.xlsx"
            exported.write_bytes(b"excel")

            result = _finalize_tiktok_creator_video_outputs(
                data_rows=[
                    {
                        "区域": "US",
                        "视频ID": "761_a",
                        "计划文件名": "US_761_a.mp4",
                        "下载结果": "下载失败",
                        "本地文件": "",
                    },
                ],
                runtime_files=[],
                exported_files=[str(exported)],
                run_params={"package_name": "TikTok达人视频包"},
                runtime_artifact_dir=str(runtime_dir),
                log=lambda _: None,
            )

            self.assertEqual(result, [str(exported)])
            self.assertFalse(runtime_dir.exists())

    def test_orphaned_active_run_cleanup_removes_runtime_download_artifacts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)
            runtime_dir = base / "data" / "tiktok-ops-assistant" / "creator_video_download" / "runtime" / "123"
            runtime_dir.mkdir(parents=True)
            (runtime_dir / "video.mp4").write_bytes(b"video")
            (runtime_dir / "video.mp4.part").write_bytes(b"part")

            from unittest.mock import patch

            with patch("core.data_sink.artifact_dir_path", return_value=runtime_dir):
                _cleanup_orphaned_runtime_artifacts([{
                    "id": 123,
                    "adapter_id": "tiktok-ops-assistant",
                    "task_id": "creator_video_download",
                }])

            self.assertFalse(runtime_dir.exists())


if __name__ == "__main__":
    unittest.main()
